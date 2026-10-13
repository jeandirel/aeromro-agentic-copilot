"""MCP server exposing the engine fleet as tools any MCP-capable agent can use.

Tools (each one goes through the harness gateway, see ``aeromro.harness.gateway``):

- ``list_engines``, ``read_engine_telemetry``, ``estimate_rul``: read only, always allowed;
- ``recommend_inspection``: a recommendation, flagged for human review below 0.7 confidence;
- ``draft_work_order``: a side effect, so it is only drafted and waits for human approval.

Run it locally over stdio (for an IDE or a desktop MCP client)::

    python -m aeromro.tools.fleet_server

The API also serves it over Streamable HTTP at ``/mcp`` (stateless, JSON responses).
"""

from __future__ import annotations

import argparse
import itertools
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp_types import ToolAnnotations
from pydantic import BaseModel, Field

from aeromro import __version__
from aeromro.config import get_settings
from aeromro.fleet import (
    KEY_SENSORS,
    SENSORS,
    SUBSETS,
    EngineAssessment,
    FleetService,
    Thresholds,
    UnknownEngineError,
    UnknownSubsetError,
)
from aeromro.harness.gateway import ActionDenied, ToolGateway
from aeromro.harness.policy import ActionPolicy, Decision

Subset = Literal["FD001", "FD002", "FD003", "FD004"]
StatusFilter = Literal["inspect_now", "plan_inspection", "healthy"]

READ_ONLY = ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False)

INSTRUCTIONS = (
    "Tools over a simulated turbofan fleet (NASA C-MAPSS). RUL means remaining useful life in "
    "operating cycles, with an 80 % interval. Recommendations are decision support: a "
    "maintenance engineer decides. Work orders are only drafted and wait for human approval."
)


class EngineStatus(BaseModel):
    subset: str
    unit: int
    cycles_flown: int
    rul: float = Field(description="Estimated remaining useful life, in cycles (capped at 125)")
    rul_low: float = Field(description="Lower bound of the 80 % interval")
    rul_high: float = Field(description="Upper bound of the 80 % interval")
    status: StatusFilter
    confidence: float = Field(description="Share of the interval agreeing with the status")

    @classmethod
    def of(cls, a: EngineAssessment) -> EngineStatus:
        return cls(**a.as_dict())


class FleetList(BaseModel):
    subset: str
    conditions: int
    fault_modes: list[str]
    thresholds_cycles: dict[str, int]
    total_engines: int
    engines: list[EngineStatus] = Field(description="Most urgent first")


class TelemetryPoint(BaseModel):
    cycle: int
    rul: float
    rul_low: float
    rul_high: float
    sensors: dict[str, float] = Field(description="Sensor values z-scored within flight condition")


class Telemetry(BaseModel):
    subset: str
    unit: int
    sensor_meanings: dict[str, str]
    points: list[TelemetryPoint]


class RulEstimate(BaseModel):
    engine: EngineStatus
    model_test_rmse_clipped: float | None = Field(description="Model error on the NASA test set")
    model_interval_coverage: float | None
    note: str


class Recommendation(BaseModel):
    engine: EngineStatus
    recommendation: str
    policy_decision: Decision
    policy_reason: str
    requires_human_approval: bool


class WorkOrderDraft(BaseModel):
    draft_id: str
    subset: str
    unit: int
    reason: str
    created_at: str
    state: Literal["pending_approval"] = "pending_approval"
    policy_reason: str


RECOMMENDATIONS = {
    "inspect_now": "Inspect before the next flight: the estimate is below the immediate threshold.",
    "plan_inspection": "Plan an inspection at the next maintenance opportunity.",
    "healthy": "No action: keep monitoring at the usual interval.",
}


def build_fleet_server(
    fleet: FleetService, gateway: ToolGateway, *, caller: str = "mcp"
) -> MCPServer:
    server = MCPServer(
        "aeromro-fleet",
        title="AeroMRO engine fleet",
        version=__version__,
        instructions=INSTRUCTIONS,
    )
    drafts: dict[str, WorkOrderDraft] = {}
    counter = itertools.count(1)
    drafts_lock = threading.Lock()

    def guard(tool: str, action: str, args: dict, confidence: float | None = None):
        try:
            return gateway.check(tool, action, args, confidence=confidence, caller=caller)
        except ActionDenied as exc:
            raise ToolError(str(exc)) from exc

    def assessment(subset: str, unit: int) -> EngineAssessment:
        try:
            return fleet.assessment(subset, unit)
        except UnknownSubsetError as exc:
            raise ToolError(f"no model deployed for {subset}") from exc
        except UnknownEngineError as exc:
            raise ToolError(f"no engine {unit} in {subset}") from exc

    @server.tool(annotations=READ_ONLY)
    def list_engines(
        subset: Subset, status: StatusFilter | None = None, limit: int = 20
    ) -> FleetList:
        """List in-service engines of a fleet, most urgent first, optionally by status."""
        guard("list_engines", "read_engine_telemetry", {"subset": subset, "status": status})
        try:
            engines = fleet.fleet(subset)
        except UnknownSubsetError as exc:
            raise ToolError(f"no model deployed for {subset}") from exc
        selected = [EngineStatus.of(e) for e in engines if status in (None, e.status)]
        return FleetList(
            subset=subset,
            conditions=SUBSETS[subset]["conditions"],
            fault_modes=SUBSETS[subset]["fault_modes"],
            thresholds_cycles={
                "inspect_now": fleet.thresholds.inspect_now,
                "plan_inspection": fleet.thresholds.plan_inspection,
            },
            total_engines=len(selected),
            engines=selected[: max(1, min(limit, 300))],
        )

    @server.tool(annotations=READ_ONLY)
    def read_engine_telemetry(subset: Subset, unit: int, last_cycles: int = 20) -> Telemetry:
        """Recent RUL estimates and key sensor readings of one engine."""
        guard("read_engine_telemetry", "read_engine_telemetry", {"subset": subset, "unit": unit})
        assessment(subset, unit)
        rows = fleet.history(subset, unit, last=max(1, min(last_cycles, 400)))
        points = [
            TelemetryPoint(
                cycle=r["cycle"],
                rul=r["rul"],
                rul_low=r["rul_low"],
                rul_high=r["rul_high"],
                sensors={s: r[s] for s in KEY_SENSORS if s in r},
            )
            for r in rows
        ]
        return Telemetry(
            subset=subset,
            unit=unit,
            sensor_meanings={s: SENSORS[s] for s in KEY_SENSORS},
            points=points,
        )

    @server.tool(annotations=READ_ONLY)
    def estimate_rul(subset: Subset, unit: int) -> RulEstimate:
        """Remaining useful life of one engine, its 80 % interval and the model's test accuracy."""
        guard("estimate_rul", "estimate_rul", {"subset": subset, "unit": unit})
        a = assessment(subset, unit)
        test = fleet.model_info(subset).get("test", {})
        return RulEstimate(
            engine=EngineStatus.of(a),
            model_test_rmse_clipped=test.get("rmse_clipped"),
            model_interval_coverage=test.get("interval_coverage_clipped"),
            note="Simulated data (NASA C-MAPSS). Decision support only.",
        )

    @server.tool(annotations=READ_ONLY)
    def recommend_inspection(subset: Subset, unit: int) -> Recommendation:
        """Maintenance recommendation for one engine, with the harness decision on it."""
        a = assessment(subset, unit)
        decision = guard(
            "recommend_inspection",
            "recommend_inspection",
            {"subset": subset, "unit": unit},
            confidence=a.confidence,
        )
        return Recommendation(
            engine=EngineStatus.of(a),
            recommendation=RECOMMENDATIONS[a.status],
            policy_decision=decision.decision,
            policy_reason=decision.reason,
            requires_human_approval=decision.decision is not Decision.ALLOW,
        )

    @server.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
        )
    )
    def draft_work_order(subset: Subset, unit: int, reason: str) -> WorkOrderDraft:
        """Draft a maintenance work order. It is NOT issued: it waits for human approval."""
        if not 3 <= len(reason) <= 500:
            raise ToolError("reason must be between 3 and 500 characters")
        assessment(subset, unit)
        args = {"subset": subset, "unit": unit, "reason": reason}
        decision = guard("draft_work_order", "draft_work_order", args)
        with drafts_lock:
            draft_id = f"WO-{next(counter):05d}"
            draft = WorkOrderDraft(
                draft_id=draft_id,
                subset=subset,
                unit=unit,
                reason=reason,
                created_at=datetime.now(UTC).isoformat(timespec="seconds"),
                policy_reason=decision.reason,
            )
            drafts[draft_id] = draft
        return draft

    server.drafts = drafts  # type: ignore[attr-defined]  # exposed for the approval flow and tests
    return server


def default_server() -> MCPServer:
    settings = get_settings()
    thresholds = Thresholds(settings.inspect_now_cycles, settings.plan_inspection_cycles)
    fleet = FleetService(settings.data_dir, settings.models_dir, thresholds)
    gateway = ToolGateway(ActionPolicy(min_confidence=settings.min_recommendation_confidence))
    return build_fleet_server(fleet, gateway)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="AeroMRO fleet MCP server (stdio).")
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument("--models-dir", type=Path)
    args = parser.parse_args(argv)
    settings = get_settings()
    thresholds = Thresholds(settings.inspect_now_cycles, settings.plan_inspection_cycles)
    fleet = FleetService(
        args.data_dir or settings.data_dir, args.models_dir or settings.models_dir, thresholds
    )
    gateway = ToolGateway(ActionPolicy(min_confidence=settings.min_recommendation_confidence))
    build_fleet_server(fleet, gateway, caller="stdio").run("stdio")


if __name__ == "__main__":
    main()
