#!/usr/bin/env node
/**
 * Captures the main screens at desktop and phone sizes, in both themes.
 *   BASE_URL=http://127.0.0.1:4173 node e2e/screenshots.mjs [route ...]
 */
import { mkdir } from "node:fs/promises";
import { launch } from "./browser.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const out = new URL("./artifacts/", import.meta.url).pathname;
await mkdir(out, { recursive: true });

const routes = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/engines", "/copilot", "/audit"];
const viewports = (process.env.VIEWPORTS || "desktop,mobile").split(",");
const themes = (process.env.THEMES || "light").split(",");
const sizes = { desktop: { width: 1440, height: 960 }, tablet: { width: 834, height: 1112 }, mobile: { width: 390, height: 844 } };

const browser = await launch();
for (const vp of viewports) {
  for (const theme of themes) {
    const context = await browser.newContext({ viewport: sizes[vp], deviceScaleFactor: vp === "mobile" ? 2 : 1, colorScheme: theme, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("console", (m) => m.type() === "error" && console.log(`[console:${vp}] ${m.text()}`));
    page.on("pageerror", (e) => console.log(`[pageerror:${vp}] ${e.message}`));
    for (const route of routes) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      const name = `${vp}-${theme}-${route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}.png`;
      await page.screenshot({ path: out + name, fullPage: process.env.FULL !== "0" });
      console.log(`saved ${name}`);
    }
    await context.close();
  }
}
await browser.close();
