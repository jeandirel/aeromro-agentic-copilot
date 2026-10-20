/**
 * Minimal adapter that runs a Vercel Node function (`export default (req, res) => …`) on a plain
 * Node `http` request. Used only for local development (`npm run dev`) and the local production
 * preview (`npm run preview`, end-to-end tests). Vercel itself does not use this file.
 */
const MAX_BODY = 16 * 1024;

export async function runVercelFunction(handler, req, res) {
  const url = new URL(req.url, "http://localhost");
  const query = Object.fromEntries(url.searchParams);
  let raw = "";
  if (req.method !== "GET" && req.method !== "HEAD") {
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY) break;
    }
  }
  let body = raw;
  if ((req.headers["content-type"] || "").includes("application/json") && raw) {
    try { body = JSON.parse(raw); } catch { body = raw; }
  }
  const vReq = Object.assign(req, { query, body });
  let statusCode = 200;
  const vRes = {
    setHeader: (key, value) => { res.setHeader(key, value); return vRes; },
    getHeader: (key) => res.getHeader(key),
    status(code) { statusCode = code; return vRes; },
    json(payload) {
      if (!res.hasHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
      return vRes.send(JSON.stringify(payload));
    },
    send(payload) {
      res.statusCode = statusCode;
      res.end(payload);
      return vRes;
    },
    end(payload) { res.statusCode = statusCode; res.end(payload); return vRes; },
  };
  await handler(vReq, vRes);
}
