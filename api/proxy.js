/**
 * Same-origin Vercel gateway to the existing AWS Lambda / FastAPI API.
 *
 * Security model
 * - The upstream origin and the optional access code come from server-side environment variables
 *   only (AEROMRO_API_BASE_URL, AEROMRO_DEMO_ACCESS_CODE). Nothing from the browser can change
 *   the host, the scheme or the credentials, and redirects are never followed (no SSRF pivot).
 * - Only the six routes the interface uses are reachable, each with its own method and query
 *   parameter allowlist. Request bodies are rebuilt from validated fields, never forwarded raw.
 * - Cross-site requests are refused; POST requests must come from this origin.
 * - POST /ask (the only route that spends language-model tokens) is rate limited per client on
 *   each function instance, in addition to the API's own limit.
 * - Upstream answers must be JSON and are size-capped; error bodies are reduced to a short,
 *   sanitised message.
 */
import { randomUUID } from "node:crypto";

const DEFAULT_API_URL = "https://ozvpsrbzfruwnw3ibk33m4vve40libtc.lambda-url.eu-west-3.on.aws";
const MAX_REQUEST_BYTES = 2048;
const MAX_RESPONSE_BYTES = 2_000_000;
const UPSTREAM_TIMEOUT_MS = 25_000;
const ASK_LIMIT_PER_MINUTE = 6;
const STATUSES = ["inspect_now", "plan_inspection", "healthy"];

/** @typedef {{ method: "GET" | "POST", pattern: RegExp, params: Record<string, (v: string) => boolean>, cache?: boolean }} Route */

/** @type {Route[]} */
const ROUTES = [
  { method: "GET", pattern: /^\/health$/, params: {} },
  { method: "GET", pattern: /^\/fleets$/, params: {}, cache: true },
  {
    method: "GET",
    pattern: /^\/fleets\/FD00[1-4]\/engines$/,
    params: { status: (v) => STATUSES.includes(v) },
    cache: true,
  },
  {
    method: "GET",
    pattern: /^\/fleets\/FD00[1-4]\/engines\/[1-9][0-9]{0,3}$/,
    params: { history: (v) => /^[0-9]{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 400 },
    cache: true,
  },
  {
    method: "GET",
    pattern: /^\/audit$/,
    params: { limit: (v) => /^[0-9]{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 200 },
  },
  { method: "POST", pattern: /^\/ask$/, params: {} },
];

/** Best-effort per-instance sliding window for POST /ask. */
const askHits = new Map();
function allowAsk(client, now = Date.now()) {
  const hits = (askHits.get(client) || []).filter((t) => now - t < 60_000);
  if (hits.length >= ASK_LIMIT_PER_MINUTE) {
    askHits.set(client, hits);
    return Math.ceil((60_000 - (now - hits[0])) / 1000);
  }
  hits.push(now);
  askHits.set(client, hits);
  if (askHits.size > 5000) askHits.clear(); // bound memory on a long-lived instance
  return 0;
}

function header(req, name) {
  const value = req.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function clientKey(req) {
  // On Vercel, x-forwarded-for / x-real-ip are set by the platform edge, not by the browser.
  const forwarded = header(req, "x-real-ip") || String(header(req, "x-forwarded-for") || "").split(",")[0];
  return (forwarded || "unknown").trim().slice(0, 64);
}

function fail(res, status, message, extra = {}) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.send(JSON.stringify({ error: message, ...extra }));
}

/** @returns {URL} */
function upstreamBase() {
  const configured = (process.env.AEROMRO_API_BASE_URL || DEFAULT_API_URL).trim().replace(/\/$/, "");
  const base = new URL(configured);
  const local = process.env.NODE_ENV === "development" && ["127.0.0.1", "localhost"].includes(base.hostname);
  if (base.protocol !== "https:" && !(local && base.protocol === "http:")) throw new Error("HTTPS required");
  if (base.username || base.password || base.search || base.hash || (base.pathname !== "/" && base.pathname !== "")) {
    throw new Error("Invalid base URL");
  }
  return base;
}

// eslint-disable-next-line no-control-regex -- intentional: strip control and bidi override characters
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;

/** Validates and rebuilds the /ask body. Returns null when invalid. */
export function buildAskBody(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.some((k) => !["subset", "unit", "question"].includes(k))) return null;
  if (typeof raw.subset !== "string" || !/^FD00[1-4]$/.test(raw.subset)) return null;
  if (!Number.isSafeInteger(raw.unit) || raw.unit < 1 || raw.unit > 9999) return null;
  if (typeof raw.question !== "string") return null;
  const question = raw.question.normalize("NFC").replace(CONTROL_CHARS, "").replace(/[ \t]+/g, " ").trim();
  if (question.length < 3 || question.length > 500) return null;
  return { subset: raw.subset, unit: raw.unit, question };
}

const STATUS_MESSAGES = {
  400: "Requête refusée par l’API.",
  401: "Accès au copilote refusé : code d’accès manquant ou invalide côté serveur.",
  404: "Ressource introuvable dans l’API.",
  422: "Paramètres refusés par l’API.",
  429: "Limite de requêtes atteinte. Réessayez dans une minute.",
  502: "Le modèle de langage est indisponible.",
  503: "Aucun modèle n’est déployé pour cette flotte.",
};

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Vary", "Origin");

  const method = req.method;
  if (method !== "GET" && method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return fail(res, 405, "Méthode non autorisée.");
  }
  if (header(req, "sec-fetch-site") === "cross-site") return fail(res, 403, "Requête intersite refusée.");
  const origin = header(req, "origin");
  if (method === "POST") {
    if (!origin) return fail(res, 403, "Origine de requête manquante.");
    try {
      const parsed = new URL(origin);
      const local = process.env.NODE_ENV === "development" && ["127.0.0.1", "localhost"].includes(parsed.hostname);
      if ((parsed.protocol !== "https:" && !local) || parsed.host !== header(req, "host")) {
        return fail(res, 403, "Origine de requête refusée.");
      }
    } catch {
      return fail(res, 403, "Origine de requête refusée.");
    }
    if (!String(header(req, "content-type") || "").toLowerCase().startsWith("application/json")) {
      return fail(res, 415, "Le corps de la requête doit être au format JSON.");
    }
  }
  const declaredLength = Number(header(req, "content-length") || 0);
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_REQUEST_BYTES) {
    return fail(res, 413, "Corps de requête trop volumineux.");
  }

  const queryKeys = Object.keys(req.query || {});
  if (queryKeys.some((k) => k !== "path")) return fail(res, 400, "Paramètre de passerelle interdit.");
  const pathParam = req.query?.path;
  if (typeof pathParam !== "string" || pathParam.length > 120 || !pathParam.startsWith("/") || pathParam.startsWith("//") || pathParam.includes("\\")) {
    return fail(res, 400, "Chemin API invalide.");
  }

  let base;
  try {
    base = upstreamBase();
  } catch {
    return fail(res, 500, "Configuration de la passerelle invalide.");
  }
  let upstream;
  try {
    upstream = new URL(pathParam, base);
  } catch {
    return fail(res, 400, "Chemin API invalide.");
  }
  const route = ROUTES.find((r) => r.method === method && r.pattern.test(upstream.pathname));
  if (upstream.origin !== base.origin || upstream.hash || !route) return fail(res, 403, "Route non autorisée.");
  const seen = new Set();
  for (const [key, value] of upstream.searchParams) {
    const check = route.params[key];
    if (!check || seen.has(key) || !check(value)) return fail(res, 400, "Paramètre API interdit, invalide ou dupliqué.");
    seen.add(key);
  }

  /** @type {string | undefined} */
  let body;
  if (method === "POST") {
    let raw = req.body;
    if (typeof raw === "string") {
      if (raw.length > MAX_REQUEST_BYTES) return fail(res, 413, "Corps de requête trop volumineux.");
      try { raw = JSON.parse(raw); } catch { return fail(res, 400, "Corps JSON invalide."); }
    }
    const ask = buildAskBody(raw);
    if (!ask) return fail(res, 400, "Question moteur invalide : flotte FD001 à FD004, moteur entier positif, question de 3 à 500 caractères.");
    const retryAfter = allowAsk(clientKey(req));
    if (retryAfter) {
      res.setHeader("Retry-After", String(retryAfter));
      return fail(res, 429, `Limite de questions atteinte. Réessayez dans ${retryAfter} s.`, { retry_after: retryAfter });
    }
    body = JSON.stringify(ask);
  }

  /** @type {Record<string, string>} */
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (body && process.env.AEROMRO_DEMO_ACCESS_CODE) headers["X-Access-Code"] = process.env.AEROMRO_DEMO_ACCESS_CODE;

  let response;
  const started = Date.now();
  try {
    response = await fetch(upstream, {
      method,
      headers,
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const timeout = error && typeof error === "object" && "name" in error && error.name === "TimeoutError";
    return fail(res, timeout ? 504 : 502, timeout ? "Délai de réponse de l’API dépassé." : "API AWS momentanément inaccessible.");
  }
  res.setHeader("Server-Timing", `upstream;dur=${Date.now() - started}`);

  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES) return fail(res, 502, "Réponse API trop volumineuse.");
  let text;
  try {
    text = await response.text();
  } catch {
    return fail(res, 502, "Réponse API interrompue.");
  }
  if (text.length > MAX_RESPONSE_BYTES) return fail(res, 502, "Réponse API trop volumineuse.");
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return fail(res, 502, "Format de réponse inattendu de l’API AWS.");
  }

  if (!response.ok) {
    const detail = payload && typeof payload.detail === "string" ? payload.detail.replace(CONTROL_CHARS, "").slice(0, 200) : undefined;
    const retry = response.headers.get("retry-after");
    if (retry && /^[0-9]{1,4}$/.test(retry)) res.setHeader("Retry-After", retry);
    const status = response.status >= 400 && response.status <= 599 ? response.status : 502;
    return fail(res, status, STATUS_MESSAGES[status] || "Erreur de l’API AWS.", detail ? { detail } : {});
  }

  if (route.cache) res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
  res.status(200);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.send(JSON.stringify(payload));
}
