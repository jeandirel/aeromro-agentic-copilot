"""HTTP API: fleet status, engine details and an LLM explanation guarded by the harness.

Run locally with ``uvicorn aeromro.api.app:app --reload``. On AWS Lambda the same app runs behind
the Lambda Web Adapter (see ``Dockerfile.lambda`` and ``infra/app.yaml``).
"""

# No "from __future__ import annotations" here: FastAPI resolves the dependencies declared in
# route signatures at runtime, and they reference functions local to create_app.
import json
import re
import secrets
import time
from collections import defaultdict, deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from aeromro import __version__
from aeromro.config import Settings, get_settings
from aeromro.fleet import (
    KEY_SENSORS,
    SENSORS,
    SUBSETS,
    FleetService,
    Thresholds,
    UnknownEngineError,
    UnknownSubsetError,
)
from aeromro.harness import ActionPolicy, Decision, TelemetryTracker
from aeromro.harness.gateway import ToolGateway
from aeromro.llm import FallbackLLMClient, LLMClient, Message, MockLLMClient, build_llm_client
from aeromro.tools.fleet_server import build_fleet_server

SYSTEM_PROMPT = """You are AeroMRO, a decision-support assistant for turbofan engine maintenance.
Rules:
- Use only the facts provided in the FACTS block. Never invent numbers, part numbers or regulations.
- You recommend; certified maintenance staff decide. Never authorise a flight or ground an engine.
- If the policy decision is "require_approval", say clearly that a maintenance engineer must review
  the recommendation before any action.
- The data come from a NASA simulation (C-MAPSS), not from a real aircraft; say so if relevant.
- Answer in the language of the question, in at most 150 words, plain text."""


STATUS_PATTERN = "^(inspect_now|plan_inspection|healthy)$"


class AskRequest(BaseModel):
    subset: str = Field(pattern=r"^FD00[1-4]$")
    unit: int = Field(gt=0)
    question: str = Field(min_length=3, max_length=500)


class RateLimiter:
    """Sliding one-minute window per client. In-memory: per running instance, best effort."""

    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, client: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        hits = self._hits[client]
        while hits and now - hits[0] > 60:
            hits.popleft()
        if len(hits) >= self.per_minute:
            return False
        hits.append(now)
        return True


def client_id(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


STATUS_TEXT = {
    "inspect_now": "inspect before the next flight",
    "plan_inspection": "plan an inspection at the next maintenance opportunity",
    "healthy": "no action, keep monitoring",
}


def facts_summary(messages: list[Message]) -> str:
    """Answer built from the FACTS block without a language model (offline mode and fallback)."""
    match = re.search(r"FACTS:\n(\{.*\})", messages[-1].content, re.S)
    facts = json.loads(match.group(1)) if match else {}
    a = facts.get("engine", {})
    p = facts.get("policy", {})
    review = (
        " A maintenance engineer must review this recommendation before any action."
        if p.get("decision") == "require_approval"
        else ""
    )
    return (
        f"[summary without language model] Engine {a.get('unit')} of {a.get('subset')} has flown "
        f"{a.get('cycles_flown')} cycles. Estimated remaining useful life: {a.get('rul')} cycles "
        f"(80 % interval {a.get('rul_low')} to {a.get('rul_high')}). Status: "
        f"{STATUS_TEXT.get(a.get('status'), a.get('status'))} (confidence {a.get('confidence')})."
        f"{review} Simulated data (NASA C-MAPSS), decision support only."
    )


def create_app(
    settings: Settings | None = None,
    fleet: FleetService | None = None,
    llm: LLMClient | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    thresholds = Thresholds(settings.inspect_now_cycles, settings.plan_inspection_cycles)
    fleet = fleet or FleetService(settings.data_dir, settings.models_dir, thresholds)
    if llm is None:
        offline = MockLLMClient(responder=facts_summary, latency_ms=0.0, model="facts-summary")
        llm = (
            offline
            if settings.llm_provider == "mock"
            else FallbackLLMClient(build_llm_client(settings), offline)
        )
    policy = ActionPolicy(min_confidence=settings.min_recommendation_confidence)
    limiter = RateLimiter(settings.ask_rate_limit_per_minute)

    # MCP tool server over Streamable HTTP at /mcp: stateless and JSON-only, so any Lambda
    # instance can answer any request. Same fleet and same harness gateway as the HTTP API.
    gateway = ToolGateway(policy)
    mcp_server = build_fleet_server(fleet, gateway, caller="mcp-http")
    mcp_app = mcp_server.streamable_http_app(
        stateless_http=True, json_response=True, host="0.0.0.0"
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        async with mcp_server.session_manager.run():
            yield

    app = FastAPI(
        title="AeroMRO Agentic Copilot API",
        version=__version__,
        description="Engine health of a simulated turbofan fleet (NASA C-MAPSS). "
        "Decision support only, not for airworthiness decisions. "
        "MCP tools are served at /mcp (Streamable HTTP).",
        lifespan=lifespan,
    )
    app.state.gateway = gateway
    app.state.mcp_server = mcp_server
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST"],
        allow_headers=[
            "Content-Type",
            "Accept",
            "X-Access-Code",
            "Mcp-Session-Id",
            "Mcp-Protocol-Version",
        ],
        expose_headers=["Mcp-Session-Id"],
    )

    def require_subset(subset: str) -> str:
        if subset not in SUBSETS:
            raise HTTPException(404, f"unknown subset {subset}")
        if subset not in fleet.available_subsets():
            raise HTTPException(503, f"no model deployed for {subset}")
        return subset

    def check_access(x_access_code: Annotated[str | None, Header()] = None) -> None:
        expected = settings.demo_access_code
        if expected is None:
            return
        if not x_access_code or not secrets.compare_digest(
            x_access_code.encode(), expected.get_secret_value().encode()
        ):
            raise HTTPException(401, "missing or wrong access code")

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "version": __version__,
            "llm_provider": settings.llm_provider,
            "subsets": fleet.available_subsets(),
        }

    @app.get("/fleets")
    def fleets() -> list[dict[str, Any]]:
        out = []
        for subset in fleet.available_subsets():
            engines = fleet.fleet(subset)
            counts = {s: 0 for s in ("inspect_now", "plan_inspection", "healthy")}
            for e in engines:
                counts[e.status] += 1
            out.append(
                {
                    "subset": subset,
                    **SUBSETS[subset],
                    "engines": len(engines),
                    "status_counts": counts,
                    "model": fleet.model_info(subset),
                }
            )
        return out

    @app.get("/fleets/{subset}/engines")
    def engines(
        subset: Annotated[str, Depends(require_subset)],
        status: Annotated[str | None, Query(pattern=STATUS_PATTERN)] = None,
    ) -> dict[str, Any]:
        rows = [e.as_dict() for e in fleet.fleet(subset) if status in (None, e.status)]
        return {
            "subset": subset,
            "thresholds": {
                "inspect_now": thresholds.inspect_now,
                "plan_inspection": thresholds.plan_inspection,
            },
            "engines": rows,
        }

    @app.get("/fleets/{subset}/engines/{unit}")
    def engine(
        subset: Annotated[str, Depends(require_subset)],
        unit: int,
        history: Annotated[int, Query(ge=1, le=400)] = 60,
    ) -> dict[str, Any]:
        try:
            assessment = fleet.assessment(subset, unit)
            rows = fleet.history(subset, unit, last=history)
        except UnknownEngineError as exc:
            raise HTTPException(404, f"no engine {unit} in {subset}") from exc
        return {
            "engine": assessment.as_dict(),
            "history": rows,
            "sensors": {s: SENSORS[s] for s in KEY_SENSORS},
        }

    @app.post("/ask", dependencies=[Depends(check_access)])
    def ask(body: AskRequest, request: Request) -> dict[str, Any]:
        if not limiter.allow(client_id(request)):
            raise HTTPException(429, "rate limit reached, try again in a minute")
        try:
            require_subset(body.subset)
            assessment = fleet.assessment(body.subset, body.unit)
        except UnknownEngineError as exc:
            raise HTTPException(404, f"no engine {body.unit} in {body.subset}") from exc
        except UnknownSubsetError as exc:
            raise HTTPException(404, f"unknown subset {body.subset}") from exc

        if assessment.status == "healthy":
            action, confidence = "estimate_rul", None
        else:
            action, confidence = "recommend_inspection", assessment.confidence
        decision = policy.evaluate(action, confidence=confidence)
        facts = {
            "engine": assessment.as_dict(),
            "thresholds_cycles": {
                "inspect_now": thresholds.inspect_now,
                "plan_inspection": thresholds.plan_inspection,
            },
            "policy": {"action": action, "decision": decision.decision, "reason": decision.reason},
            "fleet": {"subset": body.subset, **SUBSETS[body.subset]},
        }
        messages = [
            Message(role="system", content=SYSTEM_PROMPT),
            Message(
                role="user",
                content=f"QUESTION: {body.question}\n\nFACTS:\n{json.dumps(facts, indent=1)}",
            ),
        ]
        tracker = TelemetryTracker(
            price_input_per_1k=settings.price_input_per_1k_tokens,
            price_output_per_1k=settings.price_output_per_1k_tokens,
        )
        try:
            response = llm.complete(
                messages, max_tokens=settings.ask_max_tokens, temperature=settings.temperature
            )
        except Exception as exc:  # the LLM is a remote dependency: fail visibly, not silently
            raise HTTPException(502, f"language model unavailable: {type(exc).__name__}") from exc
        tracker.record(response, label="ask")
        summary = tracker.summary()
        return {
            "answer": response.text,
            "engine": assessment.as_dict(),
            "policy": facts["policy"],
            "requires_approval": decision.decision is not Decision.ALLOW,
            "fallback_reason": response.fallback_reason,
            "usage": {
                "model": response.model,
                "input_tokens": summary.input_tokens,
                "output_tokens": summary.output_tokens,
                "latency_ms": summary.latency_p50_ms,
                "cost": summary.cost,
            },
        }

    @app.get("/audit")
    def audit(limit: Annotated[int, Query(ge=1, le=200)] = 50) -> list[dict[str, Any]]:
        """Latest tool calls seen by the harness on this instance (most recent first)."""
        records = list(gateway.records)[-limit:][::-1]
        return [
            {
                "at": r.at,
                "tool": r.tool,
                "decision": r.decision,
                "reason": r.reason,
                "caller": r.caller,
                "engine": {k: r.arguments.get(k) for k in ("subset", "unit")},
            }
            for r in records
        ]

    # Last: everything the routes above do not handle goes to the MCP app (it serves /mcp).
    app.mount("/", mcp_app)
    return app


app = create_app()
