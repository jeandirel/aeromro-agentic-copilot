# AeroMRO — operations console

Single-page application served by Vercel, talking **only** to the existing FastAPI service on AWS
Lambda through a same-origin gateway (`api/proxy.js`). Every number on screen comes from the API;
there is no seeded, hard-coded or generated engine data, and no simulated copilot answer.

## Architecture

| Layer | Choice | Why |
| --- | --- | --- |
| UI | React 19, TypeScript (strict, `noUncheckedIndexedAccess`) | typed components instead of string-built HTML; safe text rendering (no `innerHTML`) |
| Build | Vite 8 | static output for Vercel, route-level code splitting (charts load only on the engine page) |
| Styling | Tailwind CSS 4 with CSS-variable design tokens | light and dark themes from one token set |
| Primitives | Radix UI (`radix-ui`) | accessible popover, tooltip, dialog, menu, tabs, toggle group |
| Server state | TanStack Query 5 | cache, retries, refetch, request cancellation |
| Contracts | Zod 4 | every API response is validated before it reaches a component |
| Charts | hand-drawn SVG instruments (RUL tape, fleet RUL map) + Recharts 3 for time series | the signature instruments need exact control; time series need tooltips |
| Icons, fonts | Lucide; Archivo and B612 Mono, self-hosted | no third-party requests, strict CSP |

Next.js was not adopted: the console is fully client-driven by live API data, needs no SSR or SEO,
and the existing Vercel function already provides the only server-side piece (the gateway).
TanStack Table and an animation library were evaluated and left out: a sortable, filterable list
of at most 707 engines and a single entrance animation do not justify the extra weight.

```
index.html            Vite entry (theme bootstrap in public/theme-init.js, CSP-safe)
ui/
  app.tsx             providers and routes (/, /engines, /engines/:fleet/:unit, /copilot, /audit)
  lib/api/            client (timeouts, errors), Zod schemas, TanStack Query hooks
  lib/                formatting (fr-FR), domain vocabulary, CSV export, theme, copilot session store
  components/         layout shell, UI primitives, instruments (RUL tape, fleet map), charts
  features/           dashboard, engines, copilot, audit
  content/            generated photo metadata (credits, sizes, blur placeholders)
api/proxy.js          Vercel function: allowlisted gateway to the AWS API
public/images/        optimised NASA photographs (AVIF + WebP, responsive widths)
scripts/              local preview server, image pipeline
e2e/                  browser journey, screenshots
tests/proxy.test.mjs  gateway security tests
```

## Design language

Colour follows flight-deck conventions, so provenance is readable at a glance:

- **ink**: observed values (cycles flown, sensors);
- **magenta**: values computed by the RUL model (estimate, 80 % interval, confidence);
- **cyan**: recommendations, policy decisions and interactive elements;
- **red / amber / green**: inspect before next flight / plan an inspection / keep monitoring, always
  with a text label and a distinct shape (square, triangle, circle).

The signature instrument is the **RUL tape**, modelled on a primary-flight-display tape: status
bands from the API thresholds, the magenta point estimate and its interval. It appears at three
sizes (tables, copilot, diagnosis). Identifiers use **B612 Mono**, the typeface designed for Airbus
flight-deck displays; text and numbers use **Archivo** with tabular figures.

## Workspaces

- **Vue d’ensemble**: triage headline from `/fleets`, fleet RUL map (every engine on one RUL axis),
  cross-fleet inspection queue, model reliability per fleet (RMSE, measured coverage of the 80 %
  interval against its target).
- **Santé moteur**: fleet, status, search and sort filters kept in the URL; diagnosis with observed /
  predicted / recommendation readouts, prediction history with interval and thresholds, key
  condition-normalised sensors; CSV exports of the list and of an engine history.
- **Copilote**: questions to `POST /ask` for a chosen engine, contextual starter questions,
  cancellation, per-tab history (sessionStorage, never sent anywhere). Each answer is split into
  1. structured RUL facts from the API (cycles flown vs cycles remaining, interval, confidence),
  2. the policy decision and any human-review requirement,
  3. the generated explanation, labelled with the model id, and the fallback reason when the API
     answered without a language model. A consistency check flags an answer about another engine.
  The backend keeps no conversation memory; the interface says so.
- **Traçabilité**: `GET /audit` (MCP tool calls seen by the policy gateway on the answering Lambda
  instance, in memory, not durable) and the copilot decisions of the current tab.

## Security

The gateway (`api/proxy.js`):

- reads the upstream origin and the optional access code from server-side variables only
  (`AEROMRO_API_BASE_URL`, `AEROMRO_DEMO_ACCESS_CODE`); the code is sent only on `POST /ask`;
- allows six routes with their methods and query parameters, refuses anything else (403/400/405),
  never follows redirects (no SSRF pivot), refuses cross-site requests and requires a same-origin
  `Origin` and a JSON content type on POST;
- rebuilds the `/ask` body from validated fields (fleet, unit, 3–500 character question, control and
  bidirectional-override characters removed) and rate limits it per client and instance;
- size-caps and JSON-validates upstream answers, reduces error bodies to a short sanitised message,
  and caches fleet data at the edge for 60 s (never health, audit or answers).

`vercel.json` sets a strict Content-Security-Policy (`script-src 'self'`, `connect-src 'self'`,
self-hosted fonts and images), HSTS, `X-Frame-Options: DENY`, COOP and a restrictive
Permissions-Policy. LLM text is rendered as text, never as HTML.

## Run locally

```bash
npm ci
npm run dev                     # Vite on :5173, /api/proxy served by the same function
```

The proxy targets the public AWS API by default. To run against a local FastAPI instead:

```bash
python -m aeromro.data.smoke --data-dir /tmp/cmapss/data --models-dir /tmp/cmapss/models
AEROMRO_DATA_DIR=/tmp/cmapss/data AEROMRO_MODELS_DIR=/tmp/cmapss/models AEROMRO_LLM_PROVIDER=mock \
  uvicorn aeromro.api.app:app --port 8000
npm run build && AEROMRO_API_BASE_URL=http://127.0.0.1:8000 npm run preview   # :4173
```

## Checks

```bash
npm run lint          # ESLint (TypeScript, React hooks, jsx-a11y)
npm run typecheck     # tsc strict
npm test              # Vitest: formatting, contracts, API client, copilot store, components
npm run test:proxy    # gateway security tests (node:test)
npm run build
BASE_URL=http://127.0.0.1:4173 npm run test:e2e   # Chromium journey + axe-core WCAG 2.2 AA
```

The `AeroMRO UI` workflow runs all of these on every pull request; its end-to-end job serves the
build with the real gateway against the deployed AWS API, so the copilot is tested with Amazon
Bedrock (or its declared fallback). It can also be started by hand against any deployed URL.

## Deployment (Vercel)

`vercel.json` pins the framework (Vite), install (`npm ci`), build (`npm run build`) and output
(`dist`) commands, the SPA rewrite and the headers. Server-side variables:

- `AEROMRO_API_BASE_URL` — HTTPS base URL of the Lambda function (defaults to the public API);
- `AEROMRO_DEMO_ACCESS_CODE` — only if `POST /ask` requires an access code. Never prefix it with
  `VITE_` or `NEXT_PUBLIC_`.

Rollback: promote the previous deployment in Vercel, or revert the merge commit.

## Photographs

NASA Image and Video Library, illustrative only (they are not the simulated engines and imply no
NASA endorsement). Built by `scripts/build-images.mjs` from `scripts/images.manifest.json`, which
keeps the photographer and centre credits shown in the interface (“Sources et limites”):

- LRC-2026-OCIO_P-02363, Boeing 777 in a Langley hangar (NASA / Ryan Hill);
- GRC-2014-C-04835, technicians at a turbofan on a test stand (NASA Glenn);
- GRC-2025-C-07467 and GRC-2025-C-07466, engine test control room (NASA / Quentin Schwinn).

## Limits

- Data are simulated (NASA C-MAPSS). Research and decision-support prototype, not certified.
- `/audit` is per Lambda instance and in memory; copilot history lives in the browser tab only.
- The API's own `/ask` rate limit sees the gateway's address, so it is shared by all users of an
  instance; the gateway adds a per-client limit in front of it.
- The offline summary used in fallback mode is written in English by the API.
