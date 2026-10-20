// Security and contract tests for the Vercel gateway (api/proxy.js). Run: node --test tests/proxy.test.mjs
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

process.env.AEROMRO_API_BASE_URL = "https://api.example.test";
process.env.AEROMRO_DEMO_ACCESS_CODE = "s3cret-code";
const { default: handler, buildAskBody } = await import("../api/proxy.js");

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (c) => ((res.statusCode = c), res);
  res.setHeader = (k, v) => ((res.headers[k.toLowerCase()] = v), res);
  res.send = (b) => ((res.body = b), res);
  res.json = (o) => res.send(JSON.stringify(o));
  res.parsed = () => JSON.parse(res.body);
  return res;
}

let ip = 0;
function req({ method = "GET", path = "/health", query, headers = {}, body } = {}) {
  ip += 1;
  return {
    method,
    query: query ?? { path },
    headers: {
      host: "aeromro.example.app",
      "x-real-ip": `203.0.113.${ip % 250}`,
      ...(method === "POST" ? { origin: "https://aeromro.example.app", "content-type": "application/json" } : {}),
      ...headers,
    },
    body,
  };
}

let calls;
let upstream;
beforeEach(() => {
  calls = [];
  upstream = () => new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "content-type": "application/json" } });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return upstream(url, init);
  };
});
afterEach(() => {
  delete globalThis.fetch;
});

const ask = { subset: "FD001", unit: 81, question: "Faut-il inspecter ce moteur ?" };

describe("route allowlist", () => {
  for (const path of ["/health", "/fleets", "/fleets/FD004/engines", "/fleets/FD002/engines?status=inspect_now", "/fleets/FD001/engines/81?history=60", "/audit?limit=50"]) {
    it(`allows GET ${path}`, async () => {
      const res = mockRes();
      await handler(req({ path }), res);
      assert.equal(res.statusCode, 200);
      assert.equal(calls[0].url, `https://api.example.test${path}`);
    });
  }
  for (const path of ["/docs", "/openapi.json", "/mcp", "/fleets/FD005/engines", "/fleets/FD001/engines/0", "/fleets/../docs", "/ask"]) {
    it(`refuses GET ${path}`, async () => {
      const res = mockRes();
      await handler(req({ path }), res);
      assert.equal(res.statusCode, 403);
      assert.equal(calls.length, 0);
    });
  }
  it("refuses absolute and protocol-relative URLs", async () => {
    for (const path of ["https://evil.test/health", "//evil.test/health", "\\\\evil.test", "health"]) {
      const res = mockRes();
      await handler(req({ path }), res);
      assert.ok([400, 403].includes(res.statusCode), path);
    }
    assert.equal(calls.length, 0);
  });
  it("refuses unknown, duplicated or invalid query parameters", async () => {
    for (const path of ["/health?x=1", "/fleets/FD001/engines?status=all", "/fleets/FD001/engines/3?history=401", "/audit?limit=1&limit=2", "/fleets/FD001/engines/3?history=10&debug=1"]) {
      const res = mockRes();
      await handler(req({ path }), res);
      assert.equal(res.statusCode, 400, path);
    }
    assert.equal(calls.length, 0);
  });
  it("refuses parameters on the gateway itself", async () => {
    const res = mockRes();
    await handler(req({ query: { path: "/health", url: "https://evil.test" } }), res);
    assert.equal(res.statusCode, 400);
  });
  it("refuses other methods with Allow header", async () => {
    const res = mockRes();
    await handler(req({ method: "DELETE" }), res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.allow, "GET, POST");
  });
  it("refuses cross-site requests", async () => {
    const res = mockRes();
    await handler(req({ headers: { "sec-fetch-site": "cross-site" } }), res);
    assert.equal(res.statusCode, 403);
  });
});

describe("POST /ask", () => {
  it("rebuilds the body from validated fields and adds the server-side access code", async () => {
    const res = mockRes();
    await handler(req({ method: "POST", path: "/ask", body: { ...ask, question: "  Statut\u0000 du moteur ?‮ " } }), res);
    assert.equal(res.statusCode, 200);
    const sent = calls[0];
    assert.deepEqual(JSON.parse(sent.init.body), { subset: "FD001", unit: 81, question: "Statut du moteur ?" });
    assert.equal(sent.init.headers["X-Access-Code"], "s3cret-code");
    assert.equal(sent.init.redirect, "error", "redirects must never be followed");
    assert.ok(!res.body.includes("s3cret-code"));
  });
  it("never sends the access code on GET", async () => {
    await handler(req({ path: "/fleets" }), mockRes());
    assert.equal(calls[0].init.headers["X-Access-Code"], undefined);
  });
  it("accepts a JSON string body", async () => {
    const res = mockRes();
    await handler(req({ method: "POST", path: "/ask", body: JSON.stringify(ask) }), res);
    assert.equal(res.statusCode, 200);
  });
  const invalid = {
    "unknown subset": { ...ask, subset: "FD009" },
    "unit zero": { ...ask, unit: 0 },
    "unit as string": { ...ask, unit: "81" },
    "unit too large": { ...ask, unit: 100000 },
    "question too short": { ...ask, question: " a " },
    "question too long": { ...ask, question: "x".repeat(501) },
    "extra field": { ...ask, model: "anthropic.claude" },
    array: [ask],
  };
  for (const [name, body] of Object.entries(invalid)) {
    it(`refuses ${name}`, async () => {
      const res = mockRes();
      await handler(req({ method: "POST", path: "/ask", body }), res);
      assert.equal(res.statusCode, 400);
      assert.equal(calls.length, 0);
    });
  }
  it("requires a same-origin Origin header", async () => {
    for (const origin of [undefined, "https://evil.test", "http://aeromro.example.app"]) {
      const r = req({ method: "POST", path: "/ask", body: ask });
      if (origin) r.headers.origin = origin;
      else delete r.headers.origin;
      const res = mockRes();
      await handler(r, res);
      assert.equal(res.statusCode, 403, String(origin));
    }
  });
  it("requires a JSON content type", async () => {
    const res = mockRes();
    await handler(req({ method: "POST", path: "/ask", body: ask, headers: { "content-type": "text/plain" } }), res);
    assert.equal(res.statusCode, 415);
  });
  it("refuses oversized bodies", async () => {
    const res = mockRes();
    await handler(req({ method: "POST", path: "/ask", body: ask, headers: { "content-length": "4096" } }), res);
    assert.equal(res.statusCode, 413);
  });
  it("rate limits each client", async () => {
    const statuses = [];
    for (let i = 0; i < 8; i += 1) {
      const r = req({ method: "POST", path: "/ask", body: ask, headers: { "x-real-ip": "198.51.100.7" } });
      const res = mockRes();
      await handler(r, res);
      statuses.push(res.statusCode);
      if (res.statusCode === 429) assert.match(res.headers["retry-after"], /^[0-9]+$/);
    }
    assert.deepEqual(statuses.slice(0, 6), [200, 200, 200, 200, 200, 200]);
    assert.deepEqual(statuses.slice(6), [429, 429]);
  });
  it("exports a reusable validator", () => {
    assert.equal(buildAskBody({ subset: "FD002", unit: 1, question: "abc" })?.question, "abc");
    assert.equal(buildAskBody(null), null);
  });
});

describe("upstream handling", () => {
  it("passes upstream errors with a sanitised detail", async () => {
    upstream = () => new Response(JSON.stringify({ detail: "rate limit reached, try again in a minute" }), { status: 429, headers: { "retry-after": "60" } });
    const res = mockRes();
    await handler(req({ method: "POST", path: "/ask", body: ask }), res);
    assert.equal(res.statusCode, 429);
    assert.equal(res.parsed().detail, "rate limit reached, try again in a minute");
    assert.equal(res.headers["retry-after"], "60");
  });
  it("refuses non-JSON upstream answers", async () => {
    upstream = () => new Response("<html>oops</html>", { status: 200 });
    const res = mockRes();
    await handler(req({ path: "/health" }), res);
    assert.equal(res.statusCode, 502);
  });
  it("reports timeouts as 504", async () => {
    globalThis.fetch = async () => {
      const e = new Error("timeout");
      e.name = "TimeoutError";
      throw e;
    };
    const res = mockRes();
    await handler(req({ path: "/fleets" }), res);
    assert.equal(res.statusCode, 504);
  });
  it("reports network failures as 502 without leaking internals", async () => {
    globalThis.fetch = async () => {
      throw new Error("getaddrinfo ENOTFOUND internal-host");
    };
    const res = mockRes();
    await handler(req({ path: "/fleets" }), res);
    assert.equal(res.statusCode, 502);
    assert.ok(!res.body.includes("internal-host"));
  });
  it("caches fleet data at the edge but never health, audit or answers", async () => {
    const fleets = mockRes();
    await handler(req({ path: "/fleets" }), fleets);
    assert.match(fleets.headers["cache-control"], /s-maxage=60/);
    for (const path of ["/health", "/audit?limit=5"]) {
      const res = mockRes();
      await handler(req({ path }), res);
      assert.equal(res.headers["cache-control"], "no-store, max-age=0");
    }
    const answer = mockRes();
    await handler(req({ method: "POST", path: "/ask", body: ask }), answer);
    assert.equal(answer.headers["cache-control"], "no-store, max-age=0");
  });
  it("refuses a misconfigured upstream origin", async () => {
    const previous = process.env.AEROMRO_API_BASE_URL;
    process.env.AEROMRO_API_BASE_URL = "http://plain-http.example.test";
    const res = mockRes();
    await handler(req({ path: "/health" }), res);
    process.env.AEROMRO_API_BASE_URL = previous;
    assert.equal(res.statusCode, 500);
    assert.equal(calls.length, 0);
  });
});
