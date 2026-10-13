import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from aeromro.api.app import RateLimiter, create_app
from aeromro.config import Settings
from aeromro.data.synthetic import write_cmapss
from aeromro.fleet import FleetService, Thresholds, assess
from aeromro.llm import LLMResponse, MockLLMClient, Usage
from aeromro.rul.model import RULConfig, RULModel
from aeromro.rul.train import truncate_engines

FAST = RULConfig(max_iter=60, min_samples_leaf=20, long_window=10)


@pytest.fixture(scope="module")
def deployed(tmp_path_factory, make_fleet):
    root = tmp_path_factory.mktemp("deploy")
    data, models = root / "data", root / "models"
    data.mkdir()
    in_service, _ = truncate_engines(
        make_fleet(8, seed=21), np.random.default_rng(3), cuts_per_engine=1
    )
    write_cmapss(in_service, data / "test_FD001.txt")
    RULModel(FAST, metadata={"subset": "FD001"}).fit(make_fleet(12, seed=20)).save(
        models / "rul_FD001.joblib"
    )
    return data, models


def make_client(deployed, **overrides):
    data, models = deployed
    settings = Settings(_env_file=None, data_dir=data, models_dir=models, **overrides)
    return TestClient(create_app(settings))


@pytest.mark.parametrize(
    ("rul", "low", "high", "status", "confidence"),
    [
        (5, 1, 12, "inspect_now", 1.0),
        (40, 30, 45, "plan_inspection", 1.0),
        (80, 60, 100, "healthy", 1.0),
        (45, 40, 60, "plan_inspection", 0.5),  # half of the interval says "healthy"
        (10, 10, 10, "inspect_now", 1.0),
    ],
)
def test_assess(rul, low, high, status, confidence):
    assert assess(rul, low, high, Thresholds(15, 50)) == (status, confidence)


def test_fleet_service_lists_only_deployed_subsets(deployed):
    data, models = deployed
    fleet = FleetService(data, models)
    assert fleet.available_subsets() == ["FD001"]
    engines = fleet.fleet("FD001")
    assert len(engines) == 8
    assert [e.rul for e in engines] == sorted(e.rul for e in engines)


def test_health_and_fleets(deployed):
    client = make_client(deployed)
    health = client.get("/health").json()
    assert health["status"] == "ok" and health["subsets"] == ["FD001"]
    fleets = client.get("/fleets").json()
    assert fleets[0]["subset"] == "FD001"
    assert sum(fleets[0]["status_counts"].values()) == fleets[0]["engines"] == 8


def test_engines_filter_and_detail(deployed):
    client = make_client(deployed)
    all_engines = client.get("/fleets/FD001/engines").json()["engines"]
    healthy = client.get("/fleets/FD001/engines", params={"status": "healthy"}).json()["engines"]
    assert all(e["status"] == "healthy" for e in healthy)
    assert len(healthy) <= len(all_engines)
    unit = all_engines[0]["unit"]
    detail = client.get(f"/fleets/FD001/engines/{unit}", params={"history": 5}).json()
    assert detail["engine"]["unit"] == unit
    assert len(detail["history"]) <= 5
    assert "sensor_4" in detail["history"][-1]
    assert detail["history"][-1]["cycle"] == detail["engine"]["cycles_flown"]


def test_unknown_subset_engine_and_bad_status(deployed):
    client = make_client(deployed)
    assert client.get("/fleets/FD009/engines").status_code == 404
    assert client.get("/fleets/FD002/engines").status_code == 503  # no model deployed
    assert client.get("/fleets/FD001/engines/999").status_code == 404
    assert client.get("/fleets/FD001/engines", params={"status": "bad"}).status_code == 422


def test_ask_returns_answer_policy_and_usage(deployed):
    client = make_client(deployed)
    unit = client.get("/fleets/FD001/engines").json()["engines"][0]["unit"]
    body = client.post("/ask", json={"subset": "FD001", "unit": unit, "question": "Status?"}).json()
    assert body["answer"].startswith("[offline mock]")
    assert body["policy"]["action"] in {"estimate_rul", "recommend_inspection"}
    assert isinstance(body["requires_approval"], bool)
    assert body["usage"]["input_tokens"] > 0


def test_ask_requires_access_code_when_configured(deployed):
    client = make_client(deployed, demo_access_code=SecretStr("s3cret"))
    payload = {"subset": "FD001", "unit": 1, "question": "Status?"}
    assert client.post("/ask", json=payload).status_code == 401
    wrong = client.post("/ask", json=payload, headers={"X-Access-Code": "nope"})
    assert wrong.status_code == 401
    ok = client.post("/ask", json=payload, headers={"X-Access-Code": "s3cret"})
    assert ok.status_code == 200


def test_ask_rate_limit(deployed):
    client = make_client(deployed, ask_rate_limit_per_minute=2)
    payload = {"subset": "FD001", "unit": 1, "question": "Status?"}
    codes = [client.post("/ask", json=payload).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_ask_validates_input(deployed):
    client = make_client(deployed)
    assert (
        client.post("/ask", json={"subset": "FD1", "unit": 1, "question": "ok?"}).status_code == 422
    )
    long_q = {"subset": "FD001", "unit": 1, "question": "x" * 501}
    assert client.post("/ask", json=long_q).status_code == 422


def test_llm_failure_is_reported_as_bad_gateway(deployed):
    class Broken(MockLLMClient):
        def complete(self, *args, **kwargs) -> LLMResponse:
            raise TimeoutError("bedrock timeout")

    data, models = deployed
    app = create_app(Settings(_env_file=None, data_dir=data, models_dir=models), llm=Broken())
    response = TestClient(app).post(
        "/ask", json={"subset": "FD001", "unit": 1, "question": "Status?"}
    )
    assert response.status_code == 502
    assert "TimeoutError" in response.json()["detail"]


def test_ask_sends_facts_and_rules_to_the_llm(deployed):
    data, models = deployed
    llm = MockLLMClient(["ok"])
    app = create_app(Settings(_env_file=None, data_dir=data, models_dir=models), llm=llm)
    TestClient(app).post("/ask", json={"subset": "FD001", "unit": 2, "question": "Status?"})
    system, user = llm.calls[0]
    assert "certified maintenance staff decide" in system.content
    assert '"unit": 2' in user.content and "QUESTION: Status?" in user.content


def test_rate_limiter_window():
    limiter = RateLimiter(per_minute=1)
    assert limiter.allow("a", now=0.0)
    assert not limiter.allow("a", now=30.0)
    assert limiter.allow("b", now=30.0)
    assert limiter.allow("a", now=61.0)


def test_usage_model_name_is_reported(deployed):
    data, models = deployed

    class Named(MockLLMClient):
        def complete(self, messages, **kwargs):
            return LLMResponse(text="x", usage=Usage(input_tokens=1, output_tokens=1), model="m-1")

    app = create_app(Settings(_env_file=None, data_dir=data, models_dir=models), llm=Named())
    body = (
        TestClient(app)
        .post("/ask", json={"subset": "FD001", "unit": 1, "question": "Status?"})
        .json()
    )
    assert body["usage"]["model"] == "m-1"


def test_precomputed_assessments_are_used_and_invalidated(deployed, tmp_path):
    import shutil

    data, models = deployed
    copy = tmp_path / "models"
    shutil.copytree(models, copy)
    written = FleetService(data, copy).precompute()
    assert [p.name for p in written] == ["fleet_FD001.json"]

    fresh = FleetService(data, copy)
    assert len(fresh.fleet("FD001")) == 8
    assert fresh._loaded == {}  # served from the cache, model not loaded

    other = FleetService(data, copy, Thresholds(inspect_now=5, plan_inspection=20))
    other.fleet("FD001")
    assert "FD001" in other._loaded  # thresholds changed: cache ignored, recomputed


def test_smoke_artifacts_serve_all_subsets(tmp_path):
    from aeromro.data.smoke import make_smoke_artifacts

    make_smoke_artifacts(tmp_path / "data", tmp_path / "models")
    fleet = FleetService(tmp_path / "data", tmp_path / "models")
    assert fleet.available_subsets() == ["FD001", "FD002", "FD003", "FD004"]
    assert all(len(fleet.fleet(s)) == 6 for s in fleet.available_subsets())
