#!/usr/bin/env node
/**
 * Local production preview: serves `dist/` like Vercel does (SPA rewrite, headers from vercel.json,
 * /api/proxy function). Used by `npm run preview` and the end-to-end tests.
 *
 *   PORT=4173 AEROMRO_API_BASE_URL=http://127.0.0.1:8000 node scripts/serve.mjs
 */
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runVercelFunction } from "./vercel-adapter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const port = Number(process.env.PORT || 4173);
process.env.NODE_ENV ??= "development"; // lets the proxy accept http://localhost origins

const vercel = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
const { default: proxy } = await import(path.join(root, "api/proxy.js"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function toRegex(source) {
  // vercel.json sources used here are simple path-to-regexp patterns: "/(.*)", "/assets/(.*)".
  return new RegExp(`^${source}$`);
}

function applyHeaders(res, pathname) {
  for (const rule of vercel.headers ?? []) {
    if (!toRegex(rule.source).test(pathname)) continue;
    for (const h of rule.headers) {
      if (h.key === "Strict-Transport-Security") continue; // plain HTTP locally
      // Locally the preview is served over http, so the HTTPS upgrade directive is dropped.
      res.setHeader(h.key, h.key === "Content-Security-Policy" ? h.value.replace(/;\s*upgrade-insecure-requests/, "") : h.value);
    }
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  applyHeaders(res, pathname);
  if (pathname === "/api/proxy") return runVercelFunction(proxy, req, res);
  if (pathname.startsWith("/api/")) {
    res.statusCode = 404;
    return res.end("Not found");
  }
  let file = path.join(dist, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(dist)) {
    res.statusCode = 400;
    return res.end();
  }
  try {
    const info = await stat(file);
    if (info.isDirectory()) throw new Error("dir");
  } catch {
    if (/^\/(assets|images)\//.test(pathname)) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    file = path.join(dist, "index.html");
    applyHeaders(res, "/index.html");
  }
  res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
  createReadStream(file).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AeroMRO preview on http://127.0.0.1:${port} (API: ${process.env.AEROMRO_API_BASE_URL ?? "default AWS URL"})`);
});
