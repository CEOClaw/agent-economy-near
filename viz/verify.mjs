// Proves viz/checker.js == task-002/checker.py, byte for byte, on every fixture
// pair plus mutations. Run from the repo root: node viz/verify.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const checker = require("./checker.js");
globalThis.window = undefined;
const src = readFileSync(new URL("./data.js", import.meta.url), "utf8");
const AP = new Function("window", src + "; return window.AGENTPROOF;")({});
const D = AP.data;
const dir = mkdtempSync(join(tmpdir(), "apviz-"));
const py = (env, del) => {
  writeFileSync(join(dir, "e.json"), JSON.stringify(env));
  writeFileSync(join(dir, "d.json"), JSON.stringify(del));
  return JSON.parse(execFileSync("python3", ["task-002/checker.py", join(dir, "e.json"), join(dir, "d.json")], { encoding: "utf8" }));
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const cases = [
  ["ohwow sample-01", D.envelope01, D.ohwowDelivery01],
  ["ohwow sample-02", D.envelope02, D.ohwowDelivery02],
  ["ohwow blocked 0.25", D.envelope02, D.blockedDelivery02],
  ["CEOClaw fail fixture", D.envelope01, D.failFixture],
];
const base = D.ohwowDelivery01;
for (const f of Object.keys(base.extracted)) {
  const d = clone(base); d.extracted[f] += "x"; cases.push([`mutate ${f}`, D.envelope01, d]);
  const m = clone(base); delete m.extracted[f]; cases.push([`missing ${f}`, D.envelope01, m]);
}
const muts = {
  "padded value": (d) => { d.extracted.AGENT_NAME = "  Ohwow-Executor-01 "; },
  "other executor": (d) => { d.executor_agent_id = "someone-else"; },
  "unicode executor": (d) => { d.executor_agent_id = "agente-Jesús-ñ-😀"; },
  "extra fields": (d) => { d.extracted.ZED = "1"; d.extracted.ALPHA = "2"; },
  "wrong schema": (d) => { d.schema = "v0"; },
  "wrong task_id": (d) => { d.task_id = "nope"; },
  "null task_id": (d) => { d.task_id = null; },
  "no extracted": (d) => { delete d.extracted; },
  "extracted array": (d) => { d.extracted = []; },
  "blocked, no spend": (d) => { d.blocked = true; },
  "blocked under cap": (d) => { d.blocked = true; d.requested_spend_usdc = 0.5; },
  "blocked over cap, no reason": (d) => { d.blocked = true; d.requested_spend_usdc = 3; },
  "blocked string true": (d) => { d.blocked = "true"; },
};
for (const [name, fn] of Object.entries(muts)) { const d = clone(base); fn(d); cases.push([name, D.envelope01, d]); }
let bad = 0;
for (const [name, env, del] of cases) {
  const a = JSON.stringify(py(env, del)), b = JSON.stringify((await checker.check(env, del)).result);
  if (a !== b) { bad++; console.log(`DIFF ${name}\n  py: ${a}\n  js: ${b}`); }
}
for (const [k, env, del] of [["ohwowResult01", D.envelope01, D.ohwowDelivery01], ["ohwowResult02", D.envelope02, D.ohwowDelivery02], ["blockedResult02", D.envelope02, D.blockedDelivery02]]) {
  const b = JSON.stringify((await checker.check(env, del)).result);
  if (b !== JSON.stringify(D[k])) { bad++; console.log(`DIFF vs committed ${k}`); }
}
console.log(`${cases.length} cases + 3 committed results: ${bad ? bad + " DIFFERENCES" : "all identical to checker.py"}`);
process.exit(bad ? 1 : 0);
