# AeroMRO — Mission Design System, release notes and verification
_Date: 19 October 2026. Branch: `feat/ultimate-operations-experience-20261019`._

## Architecture decision

Retain the current dependency-free HTML/CSS/JavaScript frontend and the existing Vercel serverless `api/proxy.js` gateway. Four functional workspaces and documented Node smoke tests already exist; a Next.js migration would introduce a build/runtime change without a demonstrated functional benefit at this stage. The additional `mission.css` layer provides a restrained, aviation-focused visual identity. Existing `styles.css` and `premium.css` remain for immediate rollback and compatibility; consolidating the CSS is a later cleanup.

- Overview: four fleet summaries and server-derived totals; load each fleet's engine list for the five lowest RUL estimates across available fleets, and select the correct fleet when navigating to an engine.
- Engine analytics: searchable, status-filtered, sortable inventory; explicit RUL remaining versus cycles flown; interactive charts for actual historical sensor fields.
- Copilot: the existing POST `/ask` is the sole source of answers. The structured `engine` object is presented before the free-text answer; policy, approval requirement, model and actual fallback are displayed. Per-page session conversation can be cleared; there is no claim of server-side history.
- Audit: GET `/audit` is instance-local and volatile; not an immutable, comprehensive or permanent record.

## Visual and interaction guidelines

Clear operational information before decoration. Dark navigation, light workspaces, a documentary turbine hero photo, sober tables, monospace engineering numbers, explicit C-MAPSS simulation labeling, reliable keyboard focus, reduced motion and mobile reflow. Photos are editorial illustrations, never evidence of the engine's condition. Prefer source-labelled imagery and graceful fallback; final licensing review is needed before commercial reuse.

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
- UI GitHub Action passed syntax and Node proxy/frontend contract tests. Python 3.11/3.12 lint/tests and standard Docker job passed. Full CI remained red because building the Lambda image hit registry `public.ecr.aws` HTTP 429 rate limiting while pulling its base image, not because of an application assertion.
- Vercel preview build: READY. Preview is access protected, so unauthenticated desktop/mobile browser capture and interactive E2E validation are outstanding. Production promotion is gated until these controls can be completed.

## Outstanding work before publishing

1. Test the protected preview with authenticated desktop and mobile browsing, capture screenshots and verify focus, contrast, images, CSS and console/network errors.
2. Replay real `/ask` questions from distinct RUL statuses **on preview**, including 429, 401/502 and fallback cases when safe and verifiable (never fabricate a fallback).
3. Retry the GitHub Lambda image CI job after registry 429 recovers; preserve provenance of images.
4. Review photograph licenses, external asset availability and cross-browser responsiveness.
5. Review operational authentication, app-level rate limiting, observability and human approval requirements before proposing use outside a research environment.
6. Once all required checks pass, merge the PR and verify the production deployment; rollback to the previous Vercel production deployment if required.

## Rollback

Do not modify the existing production alias before passing gates. The production Vercel deployment from `main` remains the rollback baseline. Revert the PR or promote the previous stable production deployment using Vercel's deployment history in case of a later rollout regression.
