import json

import anyio
import numpy as np
import pytest
from fastapi.testclient import TestClient
from mcp import Client

from aeromro.api.app import create_app
from aeromro.config import Settings
from aeromro.data.synthetic import write_cmapss
from aeromro.fleet import FleetService
from aeromro.harness.gateway import ActionDenied, ToolGateway
from aeromro.harness.policy import ActionPolicy, Decision, RiskLevel
from aeromro.rul.model import RULConfig, RULModel
from aeromro.rul.train import truncate_engines
from aeromro.tools.fleet_server import build_fleet_server

FAST = RULConfig(max_iter=60, min_samples_leaf=20, long_window=10)
MCP_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
    "Mcp-Protocol-Version": "2025-06-18",
}


@pytest.fixture(scope="module")
def fleet(tmp_path_factory, make_fleet):
    root = tmp_path_factory.mktemp("mcp")
    data, models = root / "data", root / "models"
    data.mkdir()
    in_service, _ = truncate_engines(
        make_fleet(8, seed=31), np.random.default_rng(4), cuts_per_engine=1
    )
    write_cmapss(in_service, data / "test_FD001.txt")
    RULModel(FAST).fit(make_fleet(12, seed=30)).save(models / "rul_FD001.joblib")
    return FleetService(data, models)


def call(server, name, arguments):
    async def run():
        async with Client(server) as client:
            return await client.call_tool(name, arguments)

    return anyio.run(run)


def tools_of(server):
    async def run():
        async with Client(server) as client:
            return (await client.list_tools()).tools

    return anyio.run(run)


def test_tools_are_listed_with_schemas_and_hints(fleet):
    tools = {t.name: t for t in tools_of(build_fleet_server(fleet, ToolGateway()))}
    assert set(tools) == {
        "list_engines",
        "read_engine_telemetry",
        "estimate_rul",
        "recommend_inspection",
        "draft_work_order",
    }
    assert tools["estimate_rul"].annotations.read_only_hint is True
    assert tools["draft_work_order"].annotations.read_only_hint is False
    assert all(t.output_schema for t in tools.values())
    assert tools["list_engines"].input_schema["properties"]["subset"]["enum"] == [
        "FD001",
        "FD002",
        "FD003",
        "FD004",
    ]


def test_list_and_estimate(fleet):
    server = build_fleet_server(fleet, ToolGateway())
    listing = call(server, "list_engines", {"subset": "FD001", "limit": 3}).structured_content
    assert listing["total_engines"] == 8 and len(listing["engines"]) == 3
    unit = listing["engines"][0]["unit"]
    estimate = call(server, "estimate_rul", {"subset": "FD001", "unit": unit}).structured_content
    assert estimate["engine"]["unit"] == unit
    assert (
        estimate["engine"]["rul_low"] <= estimate["engine"]["rul"] <= estimate["engine"]["rul_high"]
    )


def test_telemetry_points(fleet):
    server = build_fleet_server(fleet, ToolGateway())
    result = call(server, "read_engine_telemetry", {"subset": "FD001", "unit": 1, "last_cycles": 3})
    points = result.structured_content["points"]
    assert len(points) <= 3
    assert set(points[-1]["sensors"]) <= {"sensor_4", "sensor_7", "sensor_11", "sensor_12"}


def test_recommendation_carries_the_policy_decision(fleet):
    policy = ActionPolicy()
    policy.register("recommend_inspection", RiskLevel.ACT)  # always ask a human
    gateway = ToolGateway(policy)
    server = build_fleet_server(fleet, gateway)
    rec = call(server, "recommend_inspection", {"subset": "FD001", "unit": 1}).structured_content
    assert rec["policy_decision"] == "require_approval"
    assert rec["requires_human_approval"] is True
    assert gateway.records[-1].decision is Decision.REQUIRE_APPROVAL


def test_work_orders_are_only_drafted(fleet):
    gateway = ToolGateway()
    server = build_fleet_server(fleet, gateway)
    args = {"subset": "FD001", "unit": 2, "reason": "low RUL"}
    draft = call(server, "draft_work_order", args).structured_content
    assert draft["state"] == "pending_approval" and draft["draft_id"].startswith("WO-")
    assert server.drafts[draft["draft_id"]].unit == 2
    assert gateway.records[-1].tool == "draft_work_order"


def test_denied_and_invalid_calls_return_errors(fleet):
    policy = ActionPolicy()
    policy.register("draft_work_order", RiskLevel.FORBIDDEN)
    server = build_fleet_server(fleet, ToolGateway(policy))
    denied = call(server, "draft_work_order", {"subset": "FD001", "unit": 2, "reason": "x" * 10})
    assert denied.is_error and "denied by policy" in denied.content[0].text
    missing = call(server, "estimate_rul", {"subset": "FD001", "unit": 999})
    assert missing.is_error and "no engine 999" in missing.content[0].text
    not_deployed = call(server, "estimate_rul", {"subset": "FD002", "unit": 1})
    assert not_deployed.is_error and "no model deployed" in not_deployed.content[0].text
    short = call(server, "draft_work_order", {"subset": "FD001", "unit": 2, "reason": "x"})
    assert short.is_error


def test_gateway_writes_an_audit_trail(tmp_path):
    path = tmp_path / "audit.jsonl"
    gateway = ToolGateway(audit_path=path)
    gateway.check("t", "estimate_rul", {"unit": 1})
    with pytest.raises(ActionDenied):
        gateway.check("t", "ground_engine", {"unit": 1})
    lines = [json.loads(line) for line in path.read_text().splitlines()]
    assert [line["decision"] for line in lines] == ["allow", "deny"]


def test_mcp_over_http_and_audit_endpoint(fleet):
    settings = Settings(_env_file=None, data_dir=fleet.data_dir, models_dir=fleet.models_dir)
    with TestClient(create_app(settings)) as client:
        listed = client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
            headers=MCP_HEADERS,
        )
        assert listed.status_code == 200
        assert "estimate_rul" in {t["name"] for t in listed.json()["result"]["tools"]}
        called = client.post(
            "/mcp",
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": "estimate_rul", "arguments": {"subset": "FD001", "unit": 3}},
            },
            headers=MCP_HEADERS,
        )
        assert called.json()["result"]["structuredContent"]["engine"]["unit"] == 3
        audit = client.get("/audit").json()
        assert audit[0]["tool"] == "estimate_rul" and audit[0]["caller"] == "mcp-http"
        assert audit[0]["engine"] == {"subset": "FD001", "unit": 3}
        assert client.get("/health").status_code == 200  # API routes still win over the mount
