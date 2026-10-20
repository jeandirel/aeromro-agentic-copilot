/** Shapes copied from the production API (/fleets, /fleets/FD001/engines, /ask). */
export const SAMPLE_ENGINE = { subset: "FD001", unit: 81, cycles_flown: 213, rul: 3, rul_low: 0.3, rul_high: 12.9, status: "inspect_now", confidence: 1 } as const;
export const SAMPLE_ASK = {
  answer: "L’estimation de durée de vie restante est de 3 cycles. Un ingénieur doit valider avant toute action.",
  engine: SAMPLE_ENGINE,
  policy: { action: "recommend_inspection", decision: "allow", reason: "within policy" },
  requires_approval: false,
  fallback_reason: null,
  usage: { model: "eu.amazon.nova-2-lite-v1:0", input_tokens: 412, output_tokens: 96, latency_ms: 1180.4, cost: null },
};
