# ADR 0001: MCP for tools, A2A between agents, AG-UI towards the user

- Status: accepted
- Date: 2026-10-13

## Context

The copilot has three different integration needs:

1. agents must call tools (read telemetry, estimate RUL, search regulations);
2. the orchestrator must delegate work to specialist agents that could be owned and deployed by
   other teams;
3. the engineer must see what the agents are doing while they work, and approve risky actions.

Wiring all three with ad-hoc function calls and a custom JSON format would work for a demo, but
every new tool, agent or front end would need custom glue.

## Decision

Use one open protocol per boundary:

| Boundary | Protocol | What it gives |
| --- | --- | --- |
| Agent to tool | **MCP** (Model Context Protocol) | Tools described once, discoverable, reusable by any MCP-capable agent or IDE |
| Agent to agent | **A2A** (Agent2Agent) | Agents publish an Agent Card, receive tasks and return results without sharing code or memory |
| Agent to user interface | **AG-UI** | A standard event stream (messages, tool calls, state updates) the front end can render live |

Agents are orchestrated with **LangGraph** inside each service, because it makes state, branching
and human-in-the-loop interruptions explicit.

## Consequences

- Each tool server and each specialist agent can be tested and deployed on its own.
- The human-approval step travels as AG-UI events, so the interface does not need to know the
  internals of the agents.
- Three protocols to learn and keep up to date; all three are young and their SDKs evolve
  quickly, so versions are pinned and integration tests cover each boundary.
- For a single small service the overhead is real; it pays off when tools and agents are shared
  across teams, which is the situation this project models.
