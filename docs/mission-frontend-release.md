# AeroMRO — Mission Design System, release notes and verification
_Date: 19 October 2026. Branch: `feat/ultimate-operations-experience-20261019`._

## Architecture decision

Retain the current dependency-free HTML/CSS/JavaScript frontend and the existing Vercel serverless `api/proxy.js` gateway. Four functional workspaces and documented Node smoke tests already exist; a Next.js migration would introduce a build/runtime change without a demonstrated functional benefit at this stage. The `mission.css` and `control-room.css` layers retain a restrained visual identity while moving operational triage ahead of all decoration. Existing `styles.css` and `premium.css` remain for immediate rollback and compatibility; consolidating the CSS is a later cleanup.

- Mission Control: one cross-fleet triage queue for eight engines ordered first by backend status severity, then by remaining predicted RUL; interval at 80%, cycles already flown, and direct engine selection. A current-engine analytical panel and live API coverage strip expose operational context before secondary KPI cards.
- Overview: four fleet summaries and server-derived totals; load engine lists from each subset, explicitly flag partial coverage and avoid stale refresh cache. The first engine selected from a fleet is the highest-priority assessment, not an arbitrary first record.
- Engine analytics: searchable, status-filtered, sortable inventory; explicit RUL remaining versus cycles flown; interactive charts for actual historical sensor fields.
- In-context analysis: diagnostic and active-engine panels provide direct RUL, uncertainty and sensor question actions. The selected fleet and engine are preserved in the request; actions initiate POST `/ask` using the existing protected gateway, never a local canned AI answer.
- Copilot: the existing POST `/ask` is the sole source of answers. The structured `engine` object is presented before the free-text answer; policy, approval requirement, model and actual fallback are displayed. Per-page session conversation can be cleared; there is no claim of server-side history.
- Audit: GET `/audit` is instance-local and volatile; not an immutable, comprehensive or permanent record.

## Visual and interaction guidelines

Clear operational information before decoration. Decorative hero photography, promotional showcase and turbine photos in the engine diagnostic have been removed. The application starts with a triage queue and current engine assessment. Dark navigation, light workspaces, restrained status signaling, monospace engineering values, C-MAPSS simulation labeling, keyboard skip link, visible focus, reduced motion and mobile reflow are preserved. Do not portray simulated/historical C-MAPSS readings as live aircraft telemetry.

## Data integrity and security

- No fabricated KPI values, responses, RUL, sensor values or local algorithmic predictions.
- No code changes to Python, AWS Lambda, Bedrock, MCP, models, or infrastructure.
- Proxy continues to use one server-configured upstream origin; permitted paths and bounded query values; same-origin POST check and cross-site fetch metadata denial; body-size limit; no client-provided credentials; no-store, CSP and browser security headers.
- Security headers complement but do not replace upstream authentication and abuse protection. Authentication for `/ask` is still controlled by the existing AWS access-code arrangement; this is **not** a multi-tenant authorization system. Rate limiting in Lambda is best effort and not global. No permanent audit or approval persistence is claimed.
- Trust boundary: RUL and policy fields originate in the backend's structured JSON. The LLM explanation is not authoritative; it can contradict those fields. `allow` means a recommendation may be stated, not that a maintenance operation, flight or airworthiness status is approved.

## Verification

- Current production and AWS `GET /health` returned API status `ok`, version `0.4.0`, `llm_provider=bedrock`, four fleets.
- Real browser copilot tests on **existing production**:
  - FD001 / ENG-81: urgent; 3.0 cycles **remaining**, 213 already flown, prediction interval 0.3–12.9, policy `allow`, no declared fallback; model `eu.amazon.nova-2-lite-v1:0`.
  - FD001 / ENG-17: healthy; 53.4 cycles **remaining**, 165 already flown, prediction interval 43.4–60.1, policy `allow`, no declared fallback; same model.
  - Tests confirm existing production behaviour; **they are not E2E proof of the new protected preview**.
- Earlier PR head `b3dc3ef` subsequently passed UI and full CI. The revised Mission Control head requires a fresh completed UI and full CI run before release. Prior full CI failure due to ECR 429 was transient and not an application test failure.
- Earlier preview build: READY, but access protected. After the latest changes the connected Vercel project scope returned HTTP 403 `forbidden`; the new preview cannot currently be independently inspected. Responsive/browser E2E and preview copilot replay are therefore not yet verified. Production promotion is gated.

## Outstanding work before publishing

1. Test the protected preview with authenticated desktop and mobile browsing, capture screenshots and verify focus, contrast, images, CSS and console/network errors.
2. Replay real `/ask` questions from distinct RUL statuses **on preview**, including 429, 401/502 and fallback cases when safe and verifiable (never fabricate a fallback).
3. Retry the GitHub Lambda image CI job after registry 429 recovers; preserve provenance of images.
4. Check responsive layouts, tab/focus navigation, screen reader naming, semantic status and cross-browser behavior. External marketing photos have been removed from the operator console.
5. Review operational authentication, app-level rate limiting, observability and human approval requirements before proposing use outside a research environment.
6. Once all required checks pass, merge the PR and verify the production deployment; rollback to the previous Vercel production deployment if required.

## Rollback

Do not modify the existing production alias before passing gates. The production Vercel deployment from `main` remains the rollback baseline. Revert the PR or promote the previous stable production deployment using Vercel's deployment history in case of a later rollout regression.

## Operator workflow contract — Mission Control V2

1. User opens the control center. API health and fleet subset data are queried, and the triage queue ranks server-computed statuses and RUL without local ML inference.
2. User selects an engine from the triage queue, which switches fleet when necessary; the diagnostic chart and selected context are retrieved via the existing AWS API.
3. User may request analysis of risk, uncertainty or sensors from inside the diagnostic. The relevant fleet and unit are supplied to POST /ask; the response shows backend facts, generated narrative, model metadata and approval policy distinctly.
4. User may consult a volatile server audit, labeled explicitly as non-durable. No work orders, approvals, avionics changes, flights or maintenance actions are ever triggered.
5. On any incomplete fleet fetch, the triage queue shows an explicit warning and displays only fresh, available fleet records; the ribbon shows how many fleets were read.

**Design references:** NASA Open MCT (https://ammos.nasa.gov/openmct/), NASA Appendix F Display Standard (https://www.nasa.gov/reference/appendix-f-vol-2/). References are principles, not NASA approval, certification or affiliation.


## Design and component-selection review (20 October 2026)

**Sources reviewed:** Airbus Skywise Health Monitoring and Fleet Performance (airbus.com, skywise.com); Lufthansa Technik AVIATAR Predictive Health Analytics and Engineering Analytics Suite; shadcn/ui Sidebar/Data Table/Chart; Radix primitives; NASA C-MAPSS documentation. These are references, not endorsements, copied product surfaces or claims of NASA acceptance.

**Design positioning.** Two intentionally separate surfaces:
1. **Operator console** — high information density where necessary, task-oriented triage, RUL details and AI explanations with provenance. No irrelevant hero image or company logos.
2. **Industry showcase** — optional fifth workspace. A carefully scoped `<aero-aircraft-gallery>` Web Component provides real model-specific documentary photos, producer filters, responsive model cards, an accessible native `<dialog>` details sheet and links to source/photo credits. No OEM affiliation or actual aircraft telemetry claimed.

**Implementation choice.** Preserve the existing zero-build, server-rendered-static interface and AWS gateway for this incremental PR. Encapsulate new interactive visual features as standards-based Custom Elements with Shadow DOM, without copy-pasted Bootstrap cards, runtime CDN dependencies or an uncontrolled React migration. The aircraft gallery is independent from API and imported by one explicit script; the global app still owns operational data. This makes the new component testable independently and minimizes regressions.

### Library evaluation for future modular frontend migration

| Interaction | Design reference / library | Decision |
|---|---|---|
| Application sidebar + keyboard-friendly navigation | shadcn/ui Sidebar (Radix or Base UI) | Evaluate for a dedicated React migration; keep existing native nav in current code |
| Engine inventory / 707 simulated engines | TanStack Table with column filters, sorting, virtualization where needed | Target architecture; existing sort and filter remain real until migration |
| RUL + sensor time series, brush, crosshair, linked axes | Apache ECharts or Recharts 3 / shadcn Chart | Future chart upgrade only after benchmark and validation against the actual backend history fields |
| Aircraft model and photography card | Native Web Component and semantic dialog, responsive photo composition | **Implemented** without lying about mappings to NASA engine IDs |
| AI copilot | Structured API facts, policy, narrative separated | Existing `POST /ask` integration maintained; actions preserve selected engine |
| Maintenance work order cards and Kanban | TanStack Table, dnd-kit, Radix Dialog after role permissions | **Not implemented**. Requires work-order API, persistence, roles, validation workflows and audit, not mock cards |
| OEM / MRO prospect names | Plain text, labelled targets | Prospect use cases only; do not use trademarks to imply partnership |

### Photograph sources and licensing
- Airbus A320 — Mathious Ier, Creative Commons Zero 1.0: https://commons.wikimedia.org/wiki/File:Airbus_A320_(1).jpg
- Airbus A350 — Mathious Ier, Creative Commons Zero 1.0: https://commons.wikimedia.org/wiki/File:Airbus_A350_à_Charles_de_Gaulle_CDG.jpg
- Boeing 787 — Mathious Ier, Creative Commons Zero 1.0: https://commons.wikimedia.org/wiki/File:Boeing_787.jpg
- Boeing 777 — Adrian Pingstone, public domain: https://commons.wikimedia.org/wiki/File:Boeing_777-AA.jpg

The component links to source/credits. Sources should be rechecked prior to commercial usage; offsite Wikimedia asset loading currently needs real-browser confirmation. CSP `img-src` restricts external photos to the respective Wikimedia origins plus previously allowed editorial origins. A graceful fallback is shown when unavailable. Do not add images of Airbus A350 to FD001 / engine 81: C-MAPSS sets have **no aircraft type or registration**.

### Exit criteria before a claim of premium production readiness

1. Validate that every external image resolves and is correctly associated with its model, including src redirects and content-security policy.
2. Check navigation and gallery filtering, accessible dialog close (button/Escape), keyboard, focus management, desktop 1440px/tablet 820px/mobile 390px; perform actual browser testing, not only static contract tests.
3. Test AWS /health, /fleets, /engine history and /ask on **the new preview**, differentiate backed facts from generated narrative and fallback.
4. Maintain explicit prototype labelling. No made-up 42-aircraft fleets, AOG queues, FAAs approvals or ARINC 429 feeds.
5. Keep PR draft until browser testing and approved publication; preserve previous production deployment for rollback.
