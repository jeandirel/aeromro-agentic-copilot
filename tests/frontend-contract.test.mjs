import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html",import.meta.url),"utf8");
const script = readFileSync(new URL("../app.js",import.meta.url),"utf8");
const theme = readFileSync(new URL("../mission.css",import.meta.url),"utf8");
const gateway = readFileSync(new URL("../api/proxy.js",import.meta.url),"utf8");

test("All four operational workspaces and safety disclosure remain present",() => {
  for(const view of ["overview","fleet","assistant","audit"]) {
    assert.ok(html.includes('data-section="' + view + '"'),view);
  }
  assert.match(html,/NASA C-MAPSS/);
  assert.match(html,/non certifi|navigabilité/i);
  assert.match(html,/mission\.css/);
  assert.match(theme,/prefers-reduced-motion/);
});
test("Fleet analysis and copilot controls have real event wiring",() => {
  for(const id of ["sortSelect","resetFilters","chatClearButton","chatHistoryCount","askForm","assistantFleet","assistantEngine"]) {
    assert.ok(html.includes('id="' + id + '"'),id);
  }
  assert.match(script,/\$\("sortSelect"\)\.addEventListener/);
  assert.match(script,/\$\("chatClearButton"\)\.addEventListener/);
  assert.match(script,/sensorMetric/);
  assert.match(script,/Object\.values\(state\.enginesByFleet\)\.flat\(\)/);
  assert.match(script,/api\("\/ask",\s*\{\s*method:"POST"/);
});
test("The trusted RUL facts are presented separately from generated explanation",() => {
  assert.match(script,/entry\.engine/);
  assert.match(script,/cycles_flown/);
  assert.match(script,/rul_low/);
  assert.match(script,/rul_high/);
  assert.match(script,/copilot-verified-facts/);
  assert.match(script,/SYNTHÈSE IA/);
  assert.match(script,/requiresApproval/);
  assert.ok(!script.includes("Math.random("),"No synthetic dynamic indicators");
});
test("The gateway maintains a fixed upstream and no browser-supplied origin",() => {
  assert.match(gateway,/AEROMRO_API_BASE_URL/);
  assert.match(gateway,/upstream\.origin !== base\.origin/);
  assert.match(gateway,/sec-fetch-site/);
  assert.match(gateway,/permitted\(upstream\.pathname, req\.method\)/);
});

test("Mission Control exposes risk triage and in-context Bedrock tools", () => {
  for(const id of ["commandDeck","priorityRows","commandFocus","ribbonCritical","ribbonPlan","ribbonActive","ribbonSync"]) {
    assert.ok(html.includes('id="' + id + '"'),id);
  }
  assert.match(html,/control-room\.css/);
  assert.ok(!html.includes('class="hero"'),"Marketing hero must not displace risk triage");
  assert.ok(!html.includes('class="aero-showcase"'),"Marketing image showcase removed");
  assert.ok(!html.includes('class="engine-cover"'),"Diagnostic image replaced with actual telemetry");
  assert.match(script,/function controlRoom\(\)/);
  assert.match(script,/data-copilot-intent/);
  assert.match(script,/requestSubmit\(\)/);
  assert.match(script,/commandFocus/);
  assert.match(script,/api\("\/ask",\s*\{\s*method:"POST"/);
});
