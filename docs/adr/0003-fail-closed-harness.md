# ADR 0003: A harness that fails closed

- Status: accepted
- Date: 2026-10-13

## Context

In maintenance, an agent that takes the wrong action is worse than an agent that does nothing.
LLMs can call tools that were never meant for them, misjudge their own confidence, or loop and
burn tokens.

## Decision

Every tool call goes through the harness before it runs:

| Risk level | Examples | Decision |
| --- | --- | --- |
| `READ` | read telemetry, estimate RUL, search regulations | allowed |
| `RECOMMEND` | recommend an inspection | allowed above the confidence threshold (0.7 by default), otherwise sent to a human |
| `ACT` | draft a work order | always waits for human approval |
| `FORBIDDEN` | ground an engine | always denied: reserved to certified staff |
| not registered | anything else | denied |

The harness also records tokens, cost and latency of every LLM call and enforces a token budget
per session.

## Consequences

- Adding a tool requires classifying it; forgetting to do so blocks the tool instead of letting it
  run unchecked.
- Human approvals add friction by design; their rate is tracked in the evaluation (step 6) to tune
  the threshold.
- The policy is plain data, easy to review with domain experts and to test (see
  `tests/test_policy.py`).
