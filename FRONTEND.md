# AeroMRO — operations frontend

Responsive, dependency-free operations UI, connected **only** to the existing FastAPI routes. There is no seeded, hard-coded or randomly generated flight or engine data.

## Product surfaces

- **Overview**: live fleet status counts, risk distribution, inspection priorities, RUL history and selected-engine assessment.
- **Engine fleet**: four NASA C-MAPSS subsets when deployed; search, status filter, engine selection, confidence interval and normalized sensor measurements.
- **Copilot**: user-initiated questions to `POST /ask` with policy decisions, explicit human review, model identity, usage and fallback notice.
- **Audit**: `GET /audit`; the backend holds records in memory per Lambda instance, so this is **not** a durable compliance log.
- CSV exports always contain the actual selected fleet dataset.

The source is plain HTML, CSS and JavaScript for low initial complexity and fast deployment. The AG-UI streaming, A2A orchestration, regulation citations and human approval workflows remain **future backend features**; the UI does not pretend those endpoints currently exist.

## Deployment

1. Import the GitHub repository `jeandirel/aeromro-agentic-copilot` into Vercel or connect the existing `aeromro-agentic-copilot` project.
2. Set **Root Directory** to repository root `./`; **Framework Preset**: Other. No build command and no output directory override.
3. Set server-side variables:
   - `AEROMRO_API_BASE_URL` — deployed HTTPS AWS Lambda base URL; if omitted the project uses the public API URL documented in the root README.
   - `AEROMRO_DEMO_ACCESS_CODE` — **only if** `POST /ask` is protected by an access code. Keep this server-side; do not prefix with `NEXT_PUBLIC_` or expose it in the browser.
4. Deploy. Verify `GET /api/proxy?path=%2Fhealth`, then open the UI and navigate through the four screens.
5. Run `npm run test:ui` locally or use the `AeroMRO UI` GitHub workflow.

The Vercel serverless proxy allows only named routes and request methods. It does not accept arbitrary upstream hosts or bypass the API's policy checks.

## Safety, scope and constraints

- Source: **NASA C-MAPSS simulated turbofan engine data**. Not a certified MRO system.
- RUL and status values are estimates. The 80% RUL interval is shown separately from the policy's confidence score.
- The UI **cannot** ground an engine, issue a work order or approve a flight.
- Unreachable API or empty data returns visible error/empty states, never synthetic success metrics.
- Responsive layout, keyboard-accessible controls, explicit status text in addition to color, reduced-motion support.
- Backend files under `src/`, `infra/` and deployment workflows for AWS are unchanged.

## API contracts consumed

```
GET  /health
GET  /fleets
GET  /fleets/{FD001..FD004}/engines
GET  /fleets/{FD001..FD004}/engines/{unit}?history=60
GET  /audit?limit=50
POST /ask
```
