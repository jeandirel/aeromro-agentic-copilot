#!/usr/bin/env node
/**
 * End-to-end journey in a real Chromium against a running build (scripts/serve.mjs or a deployment).
 *
 *   BASE_URL=http://127.0.0.1:4173 node e2e/run.mjs
 *
 * It exercises the four workspaces with the real API behind the proxy (no mocks): dashboard,
 * engine filters and diagnosis, three copilot questions on two engines with different statuses,
 * session history, audit tabs, gateway refusals, theme, phone layout and accessibility (axe-core,
 * WCAG 2.2 A/AA rules). Screenshots and a JSON report go to e2e/artifacts/.
 * In GitHub Actions each copilot answer is also printed as a workflow notice.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { launch } from "./browser.mjs";

const require = createRequire(import.meta.url);
const base = (process.env.BASE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const artifacts = new URL("./artifacts/", import.meta.url).pathname;
await mkdir(artifacts, { recursive: true });
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const inCI = process.env.GITHUB_ACTIONS === "true";

const results = [];
const copilotRuns = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 400) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${String(detail).slice(0, 160)})` : ""}`);
}
async function step(name, fn) {
  try {
    await fn();
  } catch (error) {
    check(name, false, error?.message ?? error);
  }
}
const notice = (title, message) => inCI && console.log(`::notice title=${title}::${message.replace(/\r?\n/g, " ").slice(0, 900)}`);

async function axe(page, label) {
  await page.evaluate(axeSource);
  const report = await page.evaluate(() =>
    axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] }),
  );
  const serious = report.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  check(
    `axe WCAG 2.2 AA, ${label}: no serious or critical violation`,
    serious.length === 0,
    serious.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target?.join(" ")}`).join(" | ") ||
      `${report.violations.length} minor/moderate`,
  );
}

function watch(page, label) {
  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.url().includes("/api/proxy") && r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return () => {
    // 4xx answers that the journey triggers on purpose are logged by Chromium as console errors.
    const real = problems.filter((p) => !/status of 4\d\d/.test(p));
    check(`${label}: no console error, CSP violation or 5xx`, real.length === 0, real.join(" | "));
  };
}

const browser = await launch();

// ---------- Desktop journey ----------
const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce", colorScheme: "light" });
const page = await desktop.newPage();
const finishDesktop = watch(page, "Desktop");
page.setDefaultTimeout(20_000);

await step("Dashboard", async () => {
  const started = Date.now();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.locator("#hero-title").filter({ hasText: /moteur/ }).waitFor();
  const lcpish = Date.now() - started;
  check("Dashboard: fleet headline rendered from /fleets", true, `${lcpish} ms to headline`);
  await page.locator("#rul-map svg[role=img]").waitFor();
  const dots = await page.locator("#rul-map svg circle").count();
  check("Dashboard: RUL map plots the in-service engines", dots > 0, `${dots} engines`);
  const rows = await page.locator("#priority table tbody tr").count();
  check("Dashboard: inspection queue lists engines", rows > 0, `${rows} rows`);
  check("Dashboard: model reliability per fleet", (await page.locator("#models li").count()) > 0);
  const hero = await page.locator("img[fetchpriority=high]").evaluate((img) => img.complete && img.naturalWidth > 0);
  check("Dashboard: hero photograph loaded (self-hosted)", hero);
  await page.screenshot({ path: `${artifacts}desktop-dashboard.png`, fullPage: true });
  await axe(page, "dashboard");
});

let engineUrl = "";
await step("Engines", async () => {
  await page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Santé moteur" }).click();
  await page.waitForURL(/\/engines/);
  await page.getByRole("button", { name: /À planifier/ }).first().click();
  await page.waitForURL(/status=plan_inspection/);
  await page
    .waitForFunction(() => {
      const cells = [...document.querySelectorAll("section[aria-label='Liste des moteurs'] tbody tr td:nth-child(2)")];
      return cells.length > 0 && cells.every((c) => c.textContent.includes("À planifier"));
    }, null, { timeout: 8000 })
    .catch(() => {});
  const statuses = await page.locator("section[aria-label='Liste des moteurs'] tbody tr td:nth-child(2)").allInnerTexts();
  check("Engines: status filter keeps only matching engines", statuses.length > 0 && statuses.every((s) => s.includes("À planifier")), `${statuses.length} rows`);
  await page.getByRole("button", { name: "Réinitialiser" }).click();
  await page.locator("section[aria-label='Liste des moteurs'] tbody tr th a").first().click();
  await page.waitForURL(/\/engines\/FD00[1-4]\/[0-9]+/);
  engineUrl = page.url();
  await page.locator("#engine-title").waitFor();
  await page.locator("article [role=img][aria-label^='RUL estimé']").first().waitFor();
  check("Engines: diagnosis shows the RUL tape", true, engineUrl.replace(base, ""));
  await page.locator(".recharts-surface").first().waitFor();
  check("Engines: RUL history chart rendered", (await page.locator(".recharts-surface").count()) >= 1);
  await page.getByRole("radio", { name: "120 derniers cycles" }).click();
  await page.waitForResponse((r) => r.url().includes("history%3D120") && r.ok());
  check("Engines: history window reloads from the API", true);
  const sensors = await page.locator("#sensors-title").locator("xpath=../..").locator("figure").count();
  check("Engines: key sensors rendered", sensors >= 1, `${sensors} sensors`);
  await page.screenshot({ path: `${artifacts}desktop-engine.png`, fullPage: true });
  await axe(page, "engine diagnosis");
});

async function waitForAnswer(previous) {
  await page.waitForFunction(
    (n) => document.querySelectorAll("article[aria-label^='Réponse du copilote'], [role=alert] .font-semibold").length > n,
    previous,
    { timeout: 45_000 },
  );
}

async function inspectLastAnswer(label) {
  const cards = page.locator("article[aria-label^='Réponse du copilote']");
  const count = await cards.count();
  if (!count) {
    const errorText = await page.locator("[role=log] [role=alert]").last().innerText().catch(() => "no answer");
    check(`Copilot ${label}: answer received from POST /ask`, false, errorText);
    return null;
  }
  const card = cards.last();
  const text = await card.innerText();
  const model = (await card.locator("header .ident").first().innerText()).trim();
  const decision = (await card.locator("section[aria-label='Décision de la politique'] span.inline-flex").first().innerText()).trim();
  const fallback = await card.locator("[role=note]").count();
  const explanation = (await card.locator("section[aria-label='Explication générée'] div.space-y-2").innerText()).trim();
  check(`Copilot ${label}: answer received from POST /ask`, explanation.length > 20, `model ${model}`);
  check(`Copilot ${label}: structured RUL facts separated from generated text`, /Faits du modèle RUL/.test(text) && /Cycles parcourus/.test(text) && /Cycles restants \(RUL\)/.test(text));
  check(`Copilot ${label}: policy decision shown`, /Décision de la politique de sécurité/.test(text), decision);
  check(`Copilot ${label}: no airworthiness claim`, /Ne constitue pas une certification de navigabilité/.test(text));
  if (decision.includes("Validation humaine")) check(`Copilot ${label}: human review requirement explicit`, /Validation humaine requise : un ingénieur/.test(text));
  const run = { label, model, decision, fallback: fallback > 0, explanation: explanation.slice(0, 280) };
  copilotRuns.push(run);
  notice(`Copilot ${label}`, `model=${model} | decision=${decision} | fallback=${run.fallback} | ${run.explanation}`);
  return run;
}

await step("Copilot", async () => {
  await page.getByRole("link", { name: "Analyser avec le copilote" }).click();
  await page.waitForURL(/\/copilot\?fleet=FD00[1-4]&engine=[0-9]+/);
  const firstEngine = new URL(page.url()).searchParams.get("engine");
  const firstStatus = await page.locator("aside[aria-label='Contexte de l’analyse'] span.inline-flex.h-6").first().innerText();
  // 1. Suggested question
  const suggestion = page.locator("[role=log] ul button").first();
  await suggestion.waitFor();
  const asked = await suggestion.innerText();
  await suggestion.click();
  await page.locator("[role=log]").getByText("Analyse par l’API AWS en cours").waitFor({ timeout: 5000 }).catch(() => {});
  await waitForAnswer(0);
  await inspectLastAnswer(`#1 (engine ${firstEngine}, ${firstStatus}, suggested: "${asked.slice(0, 60)}")`);
  // 2. Typed question, Enter to send
  const input = page.locator("#question");
  await input.fill("Combien de cycles ce moteur a-t-il déjà parcourus, et combien lui en reste-t-il selon le modèle ?");
  await input.press("Enter");
  await waitForAnswer(1);
  await inspectLastAnswer(`#2 (engine ${firstEngine}, typed question)`);
  // Client-side validation (server validates too)
  await input.fill("ab");
  check("Copilot: questions under 3 characters cannot be sent", await page.getByRole("button", { name: "Envoyer la question" }).isDisabled());
  await input.fill("");
  // 3. Another engine with a different status
  const options = await page.locator("#ctx-engine option").evaluateAll((els) => els.map((o) => ({ value: o.value, label: o.textContent })));
  const statusWord = firstStatus.trim().toLowerCase();
  const other = options.find((o) => o.value !== firstEngine && !o.label.toLowerCase().includes(statusWord)) ?? options.find((o) => o.value !== firstEngine);
  await page.locator("#ctx-engine").selectOption(other.value);
  await page.waitForURL(new RegExp(`engine=${other.value}`));
  const badge = "aside[aria-label='Contexte de l’analyse'] span.inline-flex.h-6";
  await page.waitForFunction(([sel, before]) => document.querySelector(sel)?.textContent?.trim() !== before, [badge, firstStatus.trim()], { timeout: 5000 }).catch(() => {});
  const secondStatus = await page.locator(badge).first().innerText();
  check("Copilot: second engine has a different status", secondStatus !== firstStatus, `${firstStatus} -> ${secondStatus}`);
  await page.locator("[role=log] ul button").first().click();
  await waitForAnswer(0);
  await inspectLastAnswer(`#3 (engine ${other.value}, ${secondStatus})`);
  const conversations = await page.locator("#history-title").locator("xpath=../..").locator("li").count();
  check("Copilot: tab history lists both engines", conversations >= 2, `${conversations} conversations`);
  await page.screenshot({ path: `${artifacts}desktop-copilot.png`, fullPage: false });
  await axe(page, "copilot");
  // History survives a reload (sessionStorage), never sent to the server
  await page.reload();
  await page.locator("article[aria-label^='Réponse du copilote']").first().waitFor();
  check("Copilot: history restored after reload", true);
});

await step("Audit", async () => {
  await page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Traçabilité" }).click();
  await page.waitForURL(/\/audit/);
  await page.waitForFunction(() => document.querySelector("table") || document.body.innerText.includes("Aucun appel d’outil"));
  check("Audit: gateway log or explicit empty state", true);
  await page.getByRole("tab", { name: "Copilote, cet onglet" }).click();
  const rows = await page.locator("[role=tabpanel] tbody tr").count();
  check("Audit: copilot decisions of this tab listed", rows >= 3, `${rows} rows`);
  await page.screenshot({ path: `${artifacts}desktop-audit.png`, fullPage: true });
  await axe(page, "audit");
});

await step("Gateway refusals", async () => {
  const statuses = await page.evaluate(async () => {
    const get = (p) => fetch(`/api/proxy?path=${encodeURIComponent(p)}`).then((r) => r.status);
    const post = (body, headers = { "Content-Type": "application/json" }) =>
      fetch("/api/proxy?path=%2Fask", { method: "POST", headers, body }).then((r) => r.status);
    return {
      docs: await get("/docs"),
      mcp: await get("/mcp"),
      absolute: await get("https://example.com/health"),
      traversal: await get("/fleets/../docs"),
      badStatus: await get("/fleets/FD001/engines?status=all"),
      extraParam: await fetch("/api/proxy?path=%2Fhealth&url=https://example.com").then((r) => r.status),
      badSubset: await post(JSON.stringify({ subset: "FD009", unit: 1, question: "Statut ?" })),
      extraField: await post(JSON.stringify({ subset: "FD001", unit: 1, question: "Statut ?", model: "x" })),
      notJson: await post("subset=FD001", { "Content-Type": "text/plain" }),
      del: await fetch("/api/proxy?path=%2Fhealth", { method: "DELETE" }).then((r) => r.status),
    };
  });
  check("Gateway: unlisted routes refused (/docs, /mcp)", statuses.docs === 403 && statuses.mcp === 403, JSON.stringify(statuses));
  check("Gateway: absolute URLs and traversal refused", [400, 403].includes(statuses.absolute) && [400, 403].includes(statuses.traversal));
  check("Gateway: invalid parameters refused", statuses.badStatus === 400 && statuses.extraParam === 400);
  check("Gateway: invalid /ask bodies refused server-side", statuses.badSubset === 400 && statuses.extraField === 400 && statuses.notJson === 415);
  check("Gateway: other methods refused", statuses.del === 405);
});

await step("Theme", async () => {
  await page.goto(`${base}/`);
  await page.getByRole("button", { name: "Choisir le thème d’affichage" }).click();
  await page.getByRole("menuitemradio", { name: /Sombre/ }).click();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  check("Theme: dark theme applied and remembered", theme === "dark" && (await page.evaluate(() => localStorage.getItem("aeromro.theme"))) === "dark");
  await page.locator("#rul-map svg circle").first().waitFor();
  await page.screenshot({ path: `${artifacts}desktop-dashboard-dark.png`, fullPage: true });
  await axe(page, "dashboard, dark theme");
  if (engineUrl) {
    await page.goto(engineUrl);
    await page.locator(".recharts-surface").first().waitFor();
    await page.screenshot({ path: `${artifacts}desktop-engine-dark.png`, fullPage: true });
  }
  await page.goto(`${base}/route-inconnue`);
  check("Unknown route: explicit not-found page", await page.getByText("Cette page n’existe pas").isVisible());
});
finishDesktop();
await desktop.close();

// ---------- Phone ----------
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
const mobile = await phone.newPage();
const finishMobile = watch(mobile, "Phone");
mobile.setDefaultTimeout(20_000);
await step("Phone", async () => {
  const overflow = async (label) => {
    const w = await mobile.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    check(`Phone ${label}: no horizontal scrolling`, w[0] <= w[1] + 1, `${w[0]} / ${w[1]}`);
  };
  await mobile.goto(`${base}/`);
  await mobile.locator("#hero-title").filter({ hasText: /moteur/ }).waitFor();
  await mobile.locator("#rul-map svg circle").first().waitFor();
  check("Phone: bottom navigation visible", await mobile.locator("nav[aria-label='Navigation principale']").last().isVisible());
  await overflow("dashboard");
  await mobile.screenshot({ path: `${artifacts}phone-dashboard.png`, fullPage: true });
  await mobile.locator("nav[aria-label='Navigation principale']").last().getByRole("link", { name: "Moteurs" }).click();
  await mobile.locator("section[aria-label='Liste des moteurs'] tbody tr th a").first().click();
  await mobile.locator("#engine-title").waitFor();
  await mobile.locator(".recharts-surface").first().waitFor();
  await overflow("engine diagnosis");
  await mobile.screenshot({ path: `${artifacts}phone-engine.png`, fullPage: true });
  await mobile.getByRole("link", { name: "Analyser avec le copilote" }).click();
  await mobile.locator("#question").waitFor();
  await overflow("copilot");
  await mobile.screenshot({ path: `${artifacts}phone-copilot.png`, fullPage: true });
  await axe(mobile, "phone copilot");
});
finishMobile();
await phone.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
await writeFile(`${artifacts}report.json`, JSON.stringify({ base, at: new Date().toISOString(), results, copilotRuns }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (inCI) console.log(`::notice title=E2E summary::${results.length - failed.length}/${results.length} checks passed against ${base}${failed.length ? ` | failed: ${failed.map((f) => f.name).join("; ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
