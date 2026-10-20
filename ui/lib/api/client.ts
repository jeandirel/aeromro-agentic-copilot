import type { ZodType } from "zod";

export type ApiErrorKind = "http" | "network" | "timeout" | "invalid" | "aborted";

/** Error raised for every failed call, with a message written for the person using the interface. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly detail: string | null;
  readonly retryAfter: number | null;
  readonly requestId: string | null;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: { status?: number | null; detail?: string | null; retryAfter?: number | null; requestId?: string | null } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = options.status ?? null;
    this.detail = options.detail ?? null;
    this.retryAfter = options.retryAfter ?? null;
    this.requestId = options.requestId ?? null;
  }
}

export const PROXY_ENDPOINT = "/api/proxy";
const DEFAULT_TIMEOUT_MS = 20_000;

export function proxyUrl(path: string): string {
  return `${PROXY_ENDPOINT}?path=${encodeURIComponent(path)}`;
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Combines an optional caller signal with a timeout, without relying on AbortSignal.any. */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

export async function apiRequest<T>(path: string, schema: ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const guard = withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(proxyUrl(path), {
      method,
      headers: options.body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "same-origin",
      cache: "no-store",
      signal: guard.signal,
    });
  } catch {
    guard.dispose();
    if (guard.timedOut()) throw new ApiError("timeout", "Le service n’a pas répondu à temps. Réessayez dans un instant.");
    if (options.signal?.aborted) throw new ApiError("aborted", "Requête annulée.");
    throw new ApiError("network", "Connexion au service impossible. Vérifiez votre réseau, puis réessayez.");
  }
  guard.dispose();

  const requestId = response.headers.get("x-request-id");
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("invalid", "Le service a renvoyé une réponse illisible.", { status: response.status, requestId });
  }

  if (!response.ok) {
    const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
    const retryHeader = Number(response.headers.get("retry-after"));
    const retryBody = typeof body.retry_after === "number" ? body.retry_after : NaN;
    const retryAfter = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : Number.isFinite(retryBody) ? retryBody : null;
    const message = typeof body.error === "string" && body.error ? body.error : `Le service a répondu avec une erreur ${response.status}.`;
    const detail = typeof body.detail === "string" ? body.detail : null;
    throw new ApiError("http", message, { status: response.status, detail, retryAfter, requestId });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError("invalid", "La réponse du service ne correspond pas au format attendu. Aucune valeur n’a été affichée.", {
      status: response.status,
      detail: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "racine"} : ${i.message}`).join(" ; "),
      requestId,
    });
  }
  return parsed.data;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Erreur inattendue.";
}
