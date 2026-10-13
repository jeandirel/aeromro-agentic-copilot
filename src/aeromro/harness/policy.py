"""Action policy of the agent harness.

Every tool an agent may call is registered with a risk level. The harness asks the policy before
running a tool: reading data runs freely, a recommendation with low confidence goes to a human,
anything that changes the real world needs explicit approval, and some actions are never allowed.
Unknown actions are denied, so adding a tool without classifying it fails closed.
"""

from __future__ import annotations

from enum import IntEnum, StrEnum

from pydantic import BaseModel, Field


class RiskLevel(IntEnum):
    READ = 0  # look up data, no side effect
    RECOMMEND = 1  # produce advice a human will read
    ACT = 2  # change something outside the agent (a work order, a ticket)
    FORBIDDEN = 3  # safety-critical decision reserved to certified staff


class Decision(StrEnum):
    ALLOW = "allow"
    REQUIRE_APPROVAL = "require_approval"
    DENY = "deny"


class PolicyResult(BaseModel):
    action: str
    decision: Decision
    reason: str
    risk: RiskLevel | None = None


DEFAULT_ACTIONS: dict[str, RiskLevel] = {
    "read_engine_telemetry": RiskLevel.READ,
    "search_regulations": RiskLevel.READ,
    "estimate_rul": RiskLevel.READ,
    "recommend_inspection": RiskLevel.RECOMMEND,
    "draft_work_order": RiskLevel.ACT,
    "ground_engine": RiskLevel.FORBIDDEN,
}


class ActionPolicy(BaseModel):
    actions: dict[str, RiskLevel] = Field(default_factory=lambda: dict(DEFAULT_ACTIONS))
    min_confidence: float = Field(default=0.7, ge=0.0, le=1.0)

    def register(self, action: str, risk: RiskLevel) -> None:
        self.actions[action] = risk

    def evaluate(self, action: str, *, confidence: float | None = None) -> PolicyResult:
        risk = self.actions.get(action)
        if risk is None:
            return PolicyResult(
                action=action, decision=Decision.DENY, reason="unknown action (fail closed)"
            )
        if risk is RiskLevel.FORBIDDEN:
            return PolicyResult(
                action=action,
                decision=Decision.DENY,
                reason="reserved to certified maintenance staff",
                risk=risk,
            )
        if risk is RiskLevel.ACT:
            return PolicyResult(
                action=action,
                decision=Decision.REQUIRE_APPROVAL,
                reason="side effect outside the agent: human approval required",
                risk=risk,
            )
        if risk is RiskLevel.RECOMMEND and (confidence is None or confidence < self.min_confidence):
            return PolicyResult(
                action=action,
                decision=Decision.REQUIRE_APPROVAL,
                reason=f"confidence below {self.min_confidence:.2f}: human review required",
                risk=risk,
            )
        return PolicyResult(
            action=action, decision=Decision.ALLOW, reason="within policy", risk=risk
        )
