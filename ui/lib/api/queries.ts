import { keepPreviousData, useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { apiRequest } from "./client";
import {
  askResponseSchema,
  auditSchema,
  engineDetailSchema,
  enginesResponseSchema,
  fleetsSchema,
  healthSchema,
  type AskRequest,
  type FleetId,
} from "./schemas";

const FIVE_MINUTES = 5 * 60_000;

export const queryKeys = {
  health: ["health"] as const,
  fleets: ["fleets"] as const,
  engines: (subset: FleetId) => ["engines", subset] as const,
  engine: (subset: FleetId, unit: number, history: number) => ["engine", subset, unit, history] as const,
  audit: (limit: number) => ["audit", limit] as const,
};

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: async ({ signal }) => {
      const started = performance.now();
      const data = await apiRequest("/health", healthSchema, { signal, timeoutMs: 12_000 });
      return { ...data, roundTripMs: Math.round(performance.now() - started), checkedAt: Date.now() };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useFleets() {
  return useQuery({
    queryKey: queryKeys.fleets,
    queryFn: ({ signal }) => apiRequest("/fleets", fleetsSchema, { signal }),
    staleTime: FIVE_MINUTES,
  });
}

function enginesQuery(subset: FleetId) {
  return {
    queryKey: queryKeys.engines(subset),
    queryFn: ({ signal }: { signal: AbortSignal }) => apiRequest(`/fleets/${subset}/engines`, enginesResponseSchema, { signal }),
    staleTime: FIVE_MINUTES,
  };
}

export function useEngines(subset: FleetId | null) {
  return useQuery({
    ...enginesQuery(subset ?? "FD001"),
    enabled: subset !== null,
  });
}

/** Engine lists of several fleets, fetched in parallel and combined. */
export function useEngineLists(subsets: readonly FleetId[]) {
  return useQueries({
    queries: subsets.map((s) => enginesQuery(s)),
    combine: (results) => ({
      data: results.every((r) => r.data) ? results.map((r) => r.data!) : undefined,
      partial: results.map((r) => r.data).filter((d) => d !== undefined),
      isPending: results.some((r) => r.isPending),
      error: results.find((r) => r.error)?.error ?? null,
      refetch: () => Promise.all(results.map((r) => r.refetch())),
    }),
  });
}

export function useEngineDetail(subset: FleetId | null, unit: number | null, history: number) {
  return useQuery({
    queryKey: queryKeys.engine(subset ?? "FD001", unit ?? 0, history),
    queryFn: ({ signal }) => apiRequest(`/fleets/${subset}/engines/${unit}?history=${history}`, engineDetailSchema, { signal }),
    enabled: subset !== null && unit !== null,
    staleTime: FIVE_MINUTES,
    placeholderData: keepPreviousData,
  });
}

export function useAudit(limit: number) {
  return useQuery({
    queryKey: queryKeys.audit(limit),
    queryFn: ({ signal }) => apiRequest(`/audit?limit=${limit}`, auditSchema, { signal }),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useAsk() {
  return useMutation({
    mutationKey: ["ask"],
    mutationFn: ({ request, signal }: { request: AskRequest; signal?: AbortSignal }) =>
      apiRequest("/ask", askResponseSchema, { method: "POST", body: request, signal, timeoutMs: 32_000 }),
    retry: false,
  });
}
