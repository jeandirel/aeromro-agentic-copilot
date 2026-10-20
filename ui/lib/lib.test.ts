import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiError } from "./api/client";
import { askResponseSchema, enginesResponseSchema, fleetsSchema, healthSchema } from "./api/schemas";
import { conversationsOf, copilotStore } from "./copilot-store";
import { toCsv } from "./csv";
import { decisionMeta, policyReason, sortEngines, statusRule } from "./domain";
import { cycles, interval, percent, unitLabel } from "./format";
import { SAMPLE_ASK, SAMPLE_ENGINE } from "@/test/fixtures";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

afterEach(() => vi.unstubAllGlobals());

describe("format", () => {
  it("uses French number formatting with the API precision", () => {
    expect(cycles(12.9)).toBe("12,9");
    expect(cycles(3)).toBe("3,0");
    expect(interval(0.3, 12.9)).toBe("0,3 – 12,9");
    expect(percent(0.264)).toMatch(/^26\s%$/u);
    expect(cycles(null)).toBe("—");
    expect(unitLabel(7)).toBe("007");
  });
});

describe("domain vocabulary", () => {
  it("translates policy reasons produced by the harness, keeps unknown ones verbatim", () => {
    expect(policyReason("within policy")).toBe("Dans le cadre de la politique.");
    expect(policyReason("confidence below 0.70: human review required")).toBe("Confiance inférieure à 0,7 : revue humaine requise.");
    expect(policyReason("something new")).toBe("something new");
    expect(decisionMeta("require_approval").label).toBe("Validation humaine requise");
    expect(decisionMeta("other").label).toBe("other");
  });
  it("states the threshold rule from API thresholds", () => {
    expect(statusRule("plan_inspection", { inspect_now: 15, plan_inspection: 50 })).toBe("RUL estimé entre 15 et 50 cycles");
  });
  it("sorts by priority: status first, then remaining cycles", () => {
    const engines = [
      { ...SAMPLE_ENGINE, unit: 1, status: "healthy" as const, rul: 5 },
      { ...SAMPLE_ENGINE, unit: 2, status: "inspect_now" as const, rul: 9 },
      { ...SAMPLE_ENGINE, unit: 3, status: "inspect_now" as const, rul: 2 },
    ];
    expect(sortEngines(engines, "priority").map((e) => e.unit)).toEqual([3, 2, 1]);
    expect(sortEngines(engines, "rul_desc").map((e) => e.unit)).toEqual([2, 1, 3]);
  });
});

describe("CSV export", () => {
  it("neutralises spreadsheet formulas but keeps negative numbers", () => {
    const csv = toCsv([{ a: "=HYPERLINK(\"x\")", b: -2.5, c: "@cmd" }], ["a", "b", "c"]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"-2.5"`);
    expect(csv).toContain(`"'@cmd"`);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});

describe("API schemas", () => {
  it("accepts the production payloads", () => {
    expect(healthSchema.parse({ status: "ok", version: "0.4.0", llm_provider: "bedrock", subsets: ["FD001"] }).llm_provider).toBe("bedrock");
    expect(askResponseSchema.parse(SAMPLE_ASK).usage.cost).toBeNull();
    expect(enginesResponseSchema.parse({ subset: "FD001", thresholds: { inspect_now: 15, plan_inspection: 50 }, engines: [SAMPLE_ENGINE] }).engines).toHaveLength(1);
    const fleets = fleetsSchema.parse([
      {
        subset: "FD001",
        conditions: 1,
        fault_modes: ["HPC degradation"],
        engines: 100,
        status_counts: { inspect_now: 9, plan_inspection: 23, healthy: 68 },
        model: { subset: "FD001", trained_at: "2026-10-13T16:39:47+00:00", sklearn_version: "1.9.1", n_train_engines: 100, sensors: [], interval: { target_coverage: 0.8 }, test: { rmse: 12.2, rmse_clipped: 11.0, phm08_score: 242.2, interval_coverage_clipped: 0.69 } },
      },
    ]);
    expect(fleets[0]!.model.test.interval_coverage_clipped).toBe(0.69);
  });
  it("rejects values that would be displayed wrongly", () => {
    expect(askResponseSchema.safeParse({ ...SAMPLE_ASK, engine: { ...SAMPLE_ENGINE, status: "grounded" } }).success).toBe(false);
    expect(askResponseSchema.safeParse({ ...SAMPLE_ASK, engine: { ...SAMPLE_ENGINE, confidence: 1.4 } }).success).toBe(false);
    expect(askResponseSchema.safeParse({ ...SAMPLE_ASK, requires_approval: "no" }).success).toBe(false);
  });
});

describe("apiRequest", () => {
  it("calls the same-origin proxy with an encoded path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: "ok", version: "1", llm_provider: "mock", subsets: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await apiRequest("/fleets/FD001/engines/3?history=60", healthSchema);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/proxy?path=%2Ffleets%2FFD001%2Fengines%2F3%3Fhistory%3D60");
  });
  it("turns HTTP errors into readable errors with retry information", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Limite atteinte.", detail: "rate limit reached", retry_after: 42 }, 429)));
    const error = await apiRequest("/ask", askResponseSchema, { method: "POST", body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: "http", status: 429, retryAfter: 42, message: "Limite atteinte.", detail: "rate limit reached" });
  });
  it("refuses payloads that do not match the contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ answer: 3 })));
    await expect(apiRequest("/ask", askResponseSchema)).rejects.toMatchObject({ kind: "invalid" });
  });
  it("reports network failures and timeouts distinctly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiRequest("/health", healthSchema)).rejects.toMatchObject({ kind: "network" });
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))));
    await expect(apiRequest("/health", healthSchema, { timeoutMs: 20 })).rejects.toMatchObject({ kind: "timeout" });
  });
});

describe("copilot session store", () => {
  it("keeps questions and verbatim answers, grouped per engine", () => {
    copilotStore.clear();
    const q1 = copilotStore.addQuestion("FD001", 81, "Statut ?");
    copilotStore.addAnswer(q1, "FD001", 81, "Statut ?", askResponseSchema.parse(SAMPLE_ASK), 1200);
    copilotStore.addQuestion("FD002", 7, "Et celui-ci ?");
    const entries = copilotStore.snapshot();
    expect(entries).toHaveLength(3);
    expect(conversationsOf(entries).map((c) => c.key)).toEqual(["FD002:7", "FD001:81"]);
    expect(JSON.parse(window.sessionStorage.getItem("aeromro.copilot.v1")!)).toHaveLength(3);
    copilotStore.clear();
    expect(copilotStore.snapshot()).toHaveLength(0);
  });
});
