# AeroMRO Agentic Copilot

[![CI](https://github.com/jeandirel/aeromro-agentic-copilot/actions/workflows/ci.yml/badge.svg)](https://github.com/jeandirel/aeromro-agentic-copilot/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/python-3.11%20%7C%203.12-blue)
![License](https://img.shields.io/badge/license-MIT-green)

An agentic copilot for aircraft engine maintenance (MRO: maintenance, repair and overhaul).
It helps a maintenance engineer answer questions such as:

> *Engine 31 of fleet FD001: how many cycles are left, and what does the regulation require
> before the next flight?*

To answer, a team of agents combines **engine sensor data** (remaining useful life predicted on the
NASA C-MAPSS dataset) with **regulatory documents** (retrieval over public FAA texts), cites its
sources, and **never takes a safety decision on its own**: risky actions wait for a human.

> **Status: step 2 of 7, deployment pipeline ready.** The foundations, the engine-health model
> and a first API with its AWS deployment pipeline are built and tested; the agents and protocols
> are on the [roadmap](#roadmap). This README only describes what exists, and is updated at each
> step.

## What it demonstrates

| Topic | How |
| --- | --- |
| Agent architectures | LangGraph orchestrator delegating to specialist agents |
| Agentic interfaces | **MCP** for tools, **A2A** between agents, **AG-UI** towards the user ([why](docs/adr/0001-agent-protocols.md)) |
| Agent harness | Fail-closed action policy, human approval for side effects, token budget ([why](docs/adr/0003-fail-closed-harness.md)) |
| Cloud | Amazon Bedrock (Converse API), AWS Lambda, S3, CloudWatch ([why](docs/adr/0002-aws-bedrock-lambda.md)) |
| Cost, latency, reliability | Every LLM call recorded: tokens, cost, p50 / p95 latency |
| Industrial ML | Remaining useful life (RUL) of turbofan engines with a calibrated uncertainty interval ([model card](docs/model_card_rul.md)) |
| Engineering | Typed Python, tests, lint, CI, Docker, architecture decision records |

## Architecture

```mermaid
flowchart LR
    U[Maintenance engineer] -->|AG-UI event stream| UI[Web client]
    UI -->|HTTP + SSE| API[API on AWS Lambda]
    API --> O[Orchestrator agent<br/>LangGraph]
    O -->|A2A| H[Engine health agent]
    O -->|A2A| C[Compliance agent]
    H -->|MCP| T[(Telemetry + RUL tools<br/>C-MAPSS, RUL model)]
    C -->|MCP| R[(Regulation search tools<br/>RAG over FAA documents)]
    O -. every tool call .-> HN{{Harness<br/>policy, approval,<br/>cost and latency}}
    HN -. require approval .-> UI
    O & H & C -->|Converse API| B[Amazon Bedrock]
    T --- S3[(Amazon S3<br/>data and model artefacts)]
    API --- CW[(CloudWatch<br/>logs and metrics)]
```

Details in [docs/architecture.md](docs/architecture.md).

## What is built today

### Engine health model (step 2)

Predicts how many cycles an engine has left, with an 80 % interval the agents use to judge how
sure they can be. Gradient-boosted trees on condition-normalised sensor trends, interval
calibrated by conformal prediction, evaluated once on the official NASA test sets:

| Subset | Conditions / fault modes | Test RMSE (cycles, clipped at 125) | Ridge baseline | PHM08 score | Interval coverage (target 80 %) |
| --- | --- | ---: | ---: | ---: | ---: |
| FD001 | 1 / 1 | **11.03** | 15.34 | 242 | 69 % |
| FD002 | 6 / 1 | **10.45** | 15.42 | 3,643 | 88 % |
| FD003 | 1 / 2 | **10.00** | 17.05 | 245 | 76 % |
| FD004 | 6 / 2 | **11.34** | 18.59 | 3,190 | 81 % |

Everything was chosen by cross-validation on training engines, never on the test set. Unclipped
RMSE, baselines, latency (about 40 ms per engine) and limits are in the
[model card](docs/model_card_rul.md); the raw figures are in
[reports/rul_results.json](reports/rul_results.json).

### MCP tool server (step 3, first half)

The fleet is exposed as **MCP tools** that any MCP client or agent can call, each call going
through the harness gateway (policy check and audit record):

| Tool | What it returns | Harness |
| --- | --- | --- |
| `list_engines` | in-service engines of a fleet, most urgent first | read, allowed |
| `read_engine_telemetry` | recent RUL estimates and key sensors of one engine | read, allowed |
| `estimate_rul` | RUL, 80 % interval, status, model test accuracy | read, allowed |
| `recommend_inspection` | recommendation and the policy decision on it | human review below 0.7 confidence |
| `draft_work_order` | a draft, never issued | always waits for human approval |

Typed inputs (the four fleets are an enum) and typed, structured outputs. Served over stdio for
local clients and over Streamable HTTP at `/mcp` by the API (stateless, so it runs on Lambda).

```json
{ "mcpServers": { "aeromro-fleet": { "command": "python", "args": ["-m", "aeromro.tools.fleet_server"] } } }
```

### API and AWS deployment pipeline (towards step 6, deployed early)

A first slice of the product, to be online before the agents exist: fleet status, engine
details and an explanation by a Bedrock model, guarded by the harness (policy decision, token cap,
rate limit, optional access code). If the model is unavailable, a fallback answers from the same
facts and a circuit breaker stops calling it for a while. Infrastructure as code with CloudFormation, deployment from
GitHub Actions through OpenID Connect (no AWS keys stored), least-privilege role with a
permissions boundary, model registry on S3, container on AWS Lambda, CloudWatch alarms and
dashboard. Details and API reference in [docs/deployment.md](docs/deployment.md).

```bash
pip install -e ".[api]"
uvicorn aeromro.api.app:app --reload     # http://127.0.0.1:8000/docs, offline mock LLM
```

### Foundations (step 1)

- **One LLM interface, two implementations** (`aeromro.llm`): a deterministic mock, so tests and
  CI run offline at no cost, and an Amazon Bedrock client on the Converse API, which returns token
  usage and latency with every answer.
- **Action policy** (`aeromro.harness.policy`): each tool has a risk level; reads run, low-confidence
  recommendations and side effects go to a human, safety-critical actions and unknown tools are
  denied.
- **Telemetry** (`aeromro.harness.telemetry`): tokens, cost when prices are configured, p50 / p95
  latency and token budget per session.
- **C-MAPSS loader** (`aeromro.data.cmapss`): reads the NASA files and builds train and test RUL
  labels (clipped at 125 cycles by default).
- **Dataset download with checksum verification** (`aeromro.data.download`): the NASA files are
  accepted only if identical to the ones the results were produced with.
- **Quality**: 92 tests, ruff, GitHub Actions on Python 3.11 and 3.12; CI also builds and
  starts the Lambda image; a manual workflow downloads the data, retrains and publishes the models.

```console
$ python -m aeromro
aeromro-agentic-copilot 0.4.0
llm provider : mock
action policy:
  READ      estimate_rul           -> allow
  READ      read_engine_telemetry  -> allow
  READ      search_regulations     -> allow
  RECOMMEND recommend_inspection   -> allow
  ACT       draft_work_order       -> require_approval
  FORBIDDEN ground_engine          -> deny
```

## Quickstart

```bash
git clone https://github.com/jeandirel/aeromro-agentic-copilot.git
cd aeromro-agentic-copilot
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
make test       # pytest with coverage
make lint       # ruff
python -m aeromro
```

To call Amazon Bedrock instead of the mock, install the AWS extra, copy `.env.example` to `.env`,
set `AEROMRO_LLM_PROVIDER=bedrock` and a model id enabled in your account
(`AEROMRO_BEDROCK_MODEL_ID`), and use your usual AWS credentials.

```bash
pip install -e ".[aws]"
```

To reproduce the engine-health results (about 10 minutes on a 2-core machine):

```bash
python -m aeromro.data.download --dest data/raw/CMAPSSData   # NASA files, checksums verified
python -m aeromro.rul.train --data-dir data/raw/CMAPSSData --out models
```

The dataset is not stored in the repository; see [docs/data.md](docs/data.md).

## Roadmap

- [x] **1. Foundations**: LLM interface (mock and Bedrock), harness policy and telemetry,
  C-MAPSS loader, CI, ADRs
- [x] **2. RUL model**: gradient-boosted trees with a calibrated interval on FD001 to FD004,
  baselines, RMSE and PHM08 score, model card
- [ ] **3. MCP tool servers**: engine telemetry and RUL tools; regulation search with citations
  over public FAA documents
  - [x] fleet tools over MCP (stdio and Streamable HTTP), behind the harness gateway with audit
  - [ ] regulation search with citations
- [ ] **4. Agents**: LangGraph orchestrator, engine health and compliance agents over A2A,
  harness wired into every tool call with human-approval interrupts
- [ ] **5. AG-UI interface**: live stream of reasoning steps, tool calls and approval requests
- [ ] **6. AWS deployment and evaluation**: Lambda, Bedrock, S3, CloudWatch as code; evaluation
  set (answer quality, citation accuracy, tool-call accuracy); cost and latency report
  - [x] deployment pipeline: bootstrap and app templates, OIDC, model registry, deploy workflow
  - [ ] first deployment, evaluation set, cost and latency report
- [ ] **7. Results**: measured figures, limits, demo

## Project layout

```
src/aeromro/
  config.py          settings from AEROMRO_* environment variables
  llm/               LLM interface, mock client, Bedrock Converse client
  harness/           action policy, tool gateway with audit trail, cost and latency telemetry
  tools/             MCP tool servers (fleet)
  api/               HTTP API (FastAPI)
  fleet.py           in-service fleet: RUL, interval, status and confidence per engine
  data/              NASA C-MAPSS loader, RUL labels, verified download
  rul/               features, RUL model with interval, metrics, training and evaluation
tests/               unit tests (no network, no AWS account needed)
infra/               CloudFormation: account bootstrap and application stack
docs/                architecture, deployment, data sources, model card, decision records
reports/             evaluation results (JSON)
```

## Disclaimer

Personal, educational project. It uses simulated engine data (NASA C-MAPSS) and public regulatory
texts only, no proprietary or export-controlled data. It is not a certified maintenance tool and
must not be used to make airworthiness decisions. Not affiliated with any aircraft or engine
manufacturer.

## License

[MIT](LICENSE) © 2026 Jean Direl
