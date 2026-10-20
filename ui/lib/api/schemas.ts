/**
 * Runtime contracts of the AeroMRO FastAPI service (src/aeromro/api/app.py).
 * Every response is validated before it reaches a component, so a malformed or unexpected payload
 * becomes a visible error instead of a wrong number on screen.
 */
import { z } from "zod";

export const FLEET_IDS = ["FD001", "FD002", "FD003", "FD004"] as const;
export const fleetIdSchema = z.enum(FLEET_IDS);
export type FleetId = z.infer<typeof fleetIdSchema>;

export const STATUSES = ["inspect_now", "plan_inspection", "healthy"] as const;
export const statusSchema = z.enum(STATUSES);
export type EngineStatus = z.infer<typeof statusSchema>;

const finite = z.number(); // Zod 4 rejects NaN and ±Infinity by default
const nullableNumber = finite.nullable().optional().transform((v) => v ?? null);

export const healthSchema = z.object({
  status: z.string(),
  version: z.string(),
  llm_provider: z.string(),
  subsets: z.array(z.string()),
});
export type Health = z.infer<typeof healthSchema>;

export const modelInfoSchema = z.object({
  subset: z.string(),
  trained_at: z.string().nullable().optional().transform((v) => v ?? null),
  sklearn_version: z.string().nullable().optional().transform((v) => v ?? null),
  n_train_engines: nullableNumber,
  sensors: z.array(z.string()).default([]),
  interval: z
    .object({
      target_coverage: nullableNumber,
      conformal_margin: nullableNumber,
      n_calibration: nullableNumber,
    })
    .partial()
    .default({}),
  test: z
    .object({
      rmse: nullableNumber,
      rmse_clipped: nullableNumber,
      phm08_score: nullableNumber,
      interval_coverage_clipped: nullableNumber,
    })
    .partial()
    .default({}),
});
export type ModelInfo = z.infer<typeof modelInfoSchema>;

export const statusCountsSchema = z.object({
  inspect_now: z.number().int().nonnegative(),
  plan_inspection: z.number().int().nonnegative(),
  healthy: z.number().int().nonnegative(),
});
export type StatusCounts = z.infer<typeof statusCountsSchema>;

export const fleetSummarySchema = z.object({
  subset: fleetIdSchema,
  conditions: z.number().int().positive(),
  fault_modes: z.array(z.string()),
  engines: z.number().int().nonnegative(),
  status_counts: statusCountsSchema,
  model: modelInfoSchema,
});
export type FleetSummary = z.infer<typeof fleetSummarySchema>;
export const fleetsSchema = z.array(fleetSummarySchema);

export const engineSchema = z.object({
  subset: fleetIdSchema,
  unit: z.number().int().positive(),
  cycles_flown: z.number().int().nonnegative(),
  rul: finite,
  rul_low: finite,
  rul_high: finite,
  status: statusSchema,
  confidence: z.number().min(0).max(1),
});
export type Engine = z.infer<typeof engineSchema>;

export const thresholdsSchema = z.object({
  inspect_now: finite,
  plan_inspection: finite,
});
export type Thresholds = z.infer<typeof thresholdsSchema>;

export const enginesResponseSchema = z.object({
  subset: fleetIdSchema,
  thresholds: thresholdsSchema,
  engines: z.array(engineSchema),
});
export type EnginesResponse = z.infer<typeof enginesResponseSchema>;

export const historyRowSchema = z
  .object({
    cycle: z.number().int().nonnegative(),
    rul: finite,
    rul_low: finite,
    rul_high: finite,
  })
  .catchall(finite);
export type HistoryRow = z.infer<typeof historyRowSchema>;

export const engineDetailSchema = z.object({
  engine: engineSchema,
  history: z.array(historyRowSchema),
  sensors: z.record(z.string(), z.string()),
});
export type EngineDetail = z.infer<typeof engineDetailSchema>;

export const policySchema = z.object({
  action: z.string(),
  decision: z.string(),
  reason: z.string(),
});
export type Policy = z.infer<typeof policySchema>;

export const askResponseSchema = z.object({
  answer: z.string(),
  engine: engineSchema,
  policy: policySchema,
  requires_approval: z.boolean(),
  fallback_reason: z.string().nullable().optional().transform((v) => v ?? null),
  usage: z.object({
    model: z.string().nullable().optional().transform((v) => v ?? null),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    latency_ms: nullableNumber,
    cost: nullableNumber,
  }),
});
export type AskResponse = z.infer<typeof askResponseSchema>;

export const auditRecordSchema = z.object({
  at: z.string(),
  tool: z.string(),
  decision: z.string(),
  reason: z.string(),
  caller: z.string(),
  engine: z
    .object({
      subset: z.string().nullable().optional(),
      unit: z.number().nullable().optional(),
    })
    .default({}),
});
export type AuditRecord = z.infer<typeof auditRecordSchema>;
export const auditSchema = z.array(auditRecordSchema);

export const askRequestSchema = z.object({
  subset: fleetIdSchema,
  unit: z.number().int().positive().max(9999),
  question: z.string().trim().min(3, "Question trop courte (3 caractères minimum).").max(500, "500 caractères maximum."),
});
export type AskRequest = z.infer<typeof askRequestSchema>;
