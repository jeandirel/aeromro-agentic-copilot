# ADR 0002: Amazon Bedrock for models, AWS Lambda for compute

- Status: accepted (deployment details to be validated in step 6)
- Date: 2026-10-13

## Context

The copilot is used in bursts (a question, a few tool calls, an answer) and is idle most of the
time. Model choice must stay open: the right trade-off between quality, latency and cost differs
per agent (a router needs a small fast model, the final answer a stronger one).

## Decision

- **Amazon Bedrock, Converse API.** One request format for every model available in Bedrock, so
  switching model is a configuration change (`AEROMRO_BEDROCK_MODEL_ID`), not a code change.
  Token usage and latency come back in every response and feed the harness telemetry.
- **AWS Lambda** (container image) for the API and the agents: no cost when idle, scales per
  request, infrastructure described as code.
- **Amazon S3** for data and model artefacts, **CloudWatch** for logs and metrics.
- **Amazon SageMaker** stays optional: the RUL model is small enough to run inside Lambda; a
  SageMaker endpoint is worth it only if the model grows.

## Consequences and points to validate in step 6

- Lambda streams responses natively only on Node.js runtimes. For Python, streaming goes through
  the AWS Lambda Web Adapter (or a custom runtime) behind a function URL. Function URLs do not
  stream inside a VPC.
- A streamed invocation keeps running, and is billed, even if the client disconnects: the agents
  need their own time and token budgets (already present in the settings).
- 15-minute maximum duration per invocation: long investigations must be split into steps.
- Cold starts add latency; they are measured and reported with the p50 / p95 figures.
- If streaming or cold starts prove limiting, the fallback is the same container on AWS Fargate.
- Model availability differs per account and region, so no model id is hard-coded.
