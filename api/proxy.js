/**
 * Same-origin Vercel API gateway for the existing AWS Lambda / FastAPI API.
 * The upstream URL and optional access code are never accepted from a browser.
 * No backend changes, no permissive CORS and no arbitrary URL proxying.
 */
const DEFAULT_API_URL = "https://ozvpsrbzfruwnw3ibk33m4vve40libtc.lambda-url.eu-west-3.on.aws";

function permitted(path, method) {
  if (method === "GET") {
    return path === "/health" || path === "/fleets" ||
      path === "/audit" ||
      /^\/fleets\/FD00[1-4]\/engines(?:\/[1-9][0-9]*)?$/.test(path);
  }
  return method === "POST" && path === "/ask";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const pathParam = req.query?.path;
  if (typeof pathParam !== "string" || pathParam.length > 240 || !pathParam.startsWith("/") || pathParam.startsWith("//")) {
    return res.status(400).json({ error: "Chemin API invalide." });
  }

  let upstream;
  try {
    const origin = (process.env.AEROMRO_API_BASE_URL || DEFAULT_API_URL).replace(/\/$/, "");
    const base = new URL(origin);
    if (base.protocol !== "https:" && !(process.env.NODE_ENV === "development" && ["127.0.0.1", "localhost"].includes(base.hostname))) throw new Error("HTTPS required");
    upstream = new URL(pathParam, base);
    if (upstream.origin !== base.origin || !permitted(upstream.pathname, req.method)) {
      return res.status(403).json({ error: "Route non autorisée." });
    }
    const allowed = upstream.pathname === "/audit" ? ["limit"] :
      upstream.pathname.match(/\/engines\/[0-9]+$/) ? ["history"] :
      upstream.pathname.match(/\/engines$/) ? ["status"] : [];
    for (const key of upstream.searchParams.keys()) {
      if (!allowed.includes(key)) return res.status(400).json({ error: "Paramètre API interdit." });
    }
  } catch {
    return res.status(400).json({ error: "Configuration de l’API invalide." });
  }

  let body;
  if (req.method === "POST") {
    try {
      const raw = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
        !/^FD00[1-4]$/.test(raw.subset) ||
        !Number.isSafeInteger(raw.unit) || raw.unit < 1 ||
        typeof raw.question !== "string" || raw.question.trim().length < 3 ||
        raw.question.length > 500) {
        return res.status(400).json({ error: "Question moteur invalide." });
      }
      body = JSON.stringify({ subset: raw.subset, unit: raw.unit, question: raw.question.trim() });
    } catch {
      return res.status(400).json({ error: "Corps JSON invalide." });
    }
  }
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (body && process.env.AEROMRO_DEMO_ACCESS_CODE) headers["X-Access-Code"] = process.env.AEROMRO_DEMO_ACCESS_CODE;
  try {
    const response = await fetch(upstream, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    });
    const content = await response.text();
    if (content.length > 4_000_000) return res.status(502).json({ error: "Réponse API trop volumineuse." });
    res.status(response.status);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    try { return res.send(JSON.stringify(JSON.parse(content))); }
    catch { return res.status(502).json({ error: "Format de réponse inattendu de l’API AWS." }); }
  } catch (e) {
    return res.status(502).json({ error: e?.name === "TimeoutError" ? "Délai de réponse de l’API dépassé." : "API AWS momentanément inaccessible." });
  }
}
