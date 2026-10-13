"""Tool gateway: every tool call goes through the action policy and leaves an audit record.

Tools never decide alone whether they may run. The gateway asks the policy, refuses what is
denied, flags what needs a human, and records the decision with its arguments, so that what an
agent did (or tried to do) can be reviewed afterwards.
"""

from __future__ import annotations

import json
import threading
from collections import deque
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from aeromro.harness.policy import ActionPolicy, Decision, PolicyResult


class AuditRecord(BaseModel):
    at: str
    tool: str
    action: str
    decision: Decision
    reason: str
    arguments: dict[str, Any]
    caller: str = "unknown"


class ActionDenied(Exception):
    """The policy refused the action; the message is safe to show to the agent."""


class ToolGateway:
    def __init__(
        self,
        policy: ActionPolicy | None = None,
        *,
        audit_path: Path | None = None,
        keep_last: int = 1000,
    ) -> None:
        self.policy = policy or ActionPolicy()
        self.audit_path = audit_path
        self.records: deque[AuditRecord] = deque(maxlen=keep_last)
        self._lock = threading.Lock()

    def check(
        self,
        tool: str,
        action: str,
        arguments: dict[str, Any],
        *,
        confidence: float | None = None,
        caller: str = "unknown",
    ) -> PolicyResult:
        """Evaluate, record, and raise :class:`ActionDenied` if the action is denied."""
        result = self.policy.evaluate(action, confidence=confidence)
        record = AuditRecord(
            at=datetime.now(UTC).isoformat(timespec="milliseconds"),
            tool=tool,
            action=action,
            decision=result.decision,
            reason=result.reason,
            arguments=arguments,
            caller=caller,
        )
        with self._lock:
            self.records.append(record)
            if self.audit_path is not None:
                self.audit_path.parent.mkdir(parents=True, exist_ok=True)
                with self.audit_path.open("a", encoding="utf-8") as fh:
                    fh.write(json.dumps(record.model_dump(mode="json")) + "\n")
        if result.decision is Decision.DENY:
            raise ActionDenied(f"{action} denied by policy: {result.reason}")
        return result
