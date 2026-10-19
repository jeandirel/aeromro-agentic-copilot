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

## Premium imagery and assistant UX (October 2026)

Visual sources are illustrative only; they are not the NASA C-MAPSS predictive data or pictures of the four FD00X test fleets.

- Unsplash free photograph of a jet engine by [Joao](https://unsplash.com/photos/dqrwTvNAAH0), served from Unsplash's image CDN; used in the hero and Copilot header. Licensed under the Unsplash License; image loads from the provider rather than a local copy.
- [NASA research aircraft in maintenance hangar](https://svs.gsfc.nasa.gov/12179), photographed for NASA (illustrative editorial card).
- [U.S. Air Force turbine fan photo](https://www.tinker.af.mil/News/Article-Display/Article/846288/usaf-engines-tired-iron-and-cost-effective-readiness/), used in diagnostics and illustration cards.
- [NASA ground crew technicians](https://images.nasa.gov/) (image AFRC2026-0012-076), used in the Copilot safety card.

All photographs have graceful backgrounds if external loading fails. No image is presented as evidence for maintenance or as a prediction.

The Copilot offers contextual starter questions and per-session chat history. Every assistant answer is returned by the existing AWS `POST /ask` endpoint; policy decisions, human-review requirements, model and fallback are shown explicitly. There are no local/generated answers. Keyboard shortcut: Ctrl/Cmd + Enter. Review and smoke-test the policy before launch. Unit smoke tests guard the API proxy’s allowlist and request handling; production browser verification is performed separately.

## Verified facts in AI conversations

The first section of each Copilot reply displays the structured `engine` object returned by the trusted FastAPI `/ask` response, separately from the language model's free-form text. Explicitly distinguish `engine.rul` (remaining cycles) from `engine.cycles_flown` (already flown cycles). A warning reminds users that the generated interpretation can still be wrong, particularly near status thresholds. Model name, latency and an actual fallback reason (if any) appear before the explanation; a generic banner is not proof of a fallback. An `allow` policy decision permits producing the **recommendation**, not operating the aircraft.
