// JavaScript port of task-002/checker.py (structured-field-extraction-v1:1.0.0).
// Same steps, same order, same messages, same evidence_digest.
// viz/verify.mjs proves it against checker.py on every fixture plus mutations.
// Works in the browser (window.AgentProofChecker) and in Node (module.exports).
(function (root) {
  const CHECKER_REF = "structured-field-extraction-v1:1.0.0";

  // Python json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
  function pyString(s) {
    return JSON.stringify(s).replace(/[\u0080-￿]/g, (c) =>
      "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  }
  function canonicalJson(v) {
    if (v === null) return "null";
    if (typeof v === "string") return pyString(v);
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return String(v);
    if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
    return "{" + Object.keys(v).sort().map((k) => pyString(k) + ":" + canonicalJson(v[k])).join(",") + "}";
  }

  // Python str.splitlines() boundaries, then split on the FIRST ": ".
  function parseFields(inputText) {
    const fields = {};
    for (const raw of inputText.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/)) {
      const line = raw.trim();
      if (!line || !line.includes(": ")) continue;
      const i = line.indexOf(": ");
      fields[line.slice(0, i).trim()] = line.slice(i + 2).trim();
    }
    return fields;
  }

  async function sha256Hex(text) {
    const buf = await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function evidencePreimage(taskId, executorId, inputText, extracted) {
    return taskId + "|" + executorId + "|" + inputText + "|" + canonicalJson(extracted);
  }

  function pyStr(v) {
    if (v === null || v === undefined) return "None";
    if (typeof v === "boolean") return v ? "True" : "False";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  // Returns { result, steps } where result is byte-for-byte checker.py's output
  // and steps records each numbered step: "ok" | "fail" | "blocked" | "skip".
  async function check(envelope, delivery) {
    const taskId = envelope.task_id ?? "";
    const steps = [];
    const mark = (n, state, note) => steps.push({ n, state, note });
    const base = { task_id: taskId, checker_ref: CHECKER_REF };
    const done = (outcome, extra, failedAt) => {
      for (let n = failedAt + 1; n <= 7; n++) mark(n, "skip");
      return { result: { outcome, evidence_digest: null, failure_reason: null, blocked_reason: null, ...extra, ...base }, steps };
    };
    const fail = (n, reason) => { mark(n, "fail", reason); return done("fail", { failure_reason: reason }, n); };

    // Step 0: blocked (spend gate or executor self-report)
    if (delivery.blocked === true) {
      const req = delivery.requested_spend_usdc, max = envelope.max_spend_usdc;
      let reason;
      if (req != null && max != null && parseFloat(req) > parseFloat(max)) {
        reason = delivery.blocked_reason ?? `spend_gate: executor requested ${req} USDC; envelope max_spend_usdc is ${max} USDC`;
      } else {
        reason = delivery.blocked_reason ?? "executor reported blocked; no spend data supplied";
      }
      mark(0, "blocked", reason);
      return done("blocked", { blocked_reason: reason }, 0);
    }
    mark(0, "ok");
    if (delivery.schema !== "agentproof-extraction-v1") return fail(1, "schema field missing or wrong value");
    mark(1, "ok");
    if (delivery.task_id !== taskId) return fail(2, `task_id mismatch: expected '${taskId}', got '${pyStr(delivery.task_id)}'`);
    mark(2, "ok");
    if (!("extracted" in delivery)) return fail(3, "missing extracted object");
    const extracted = delivery.extracted;
    if (extracted === null || typeof extracted !== "object" || Array.isArray(extracted)) return fail(3, "extracted is not a JSON object");
    mark(3, "ok");
    const inputText = envelope.input_text ?? "";
    const expected = parseFields(inputText);
    const required = envelope.required_fields ?? [];
    mark(4, "ok");
    const fieldResults = [];
    for (const f of required) {
      if (!(f in extracted)) { fieldResults.push({ f, ok: false }); return Object.assign(fail(5, `missing required field: ${f}`), { fieldResults }); }
      const actual = pyStr(extracted[f]).trim();
      const exp = expected[f] ?? "";
      if (actual !== exp) { fieldResults.push({ f, ok: false }); return Object.assign(fail(5, `field ${f}: expected '${exp}', got '${actual}'`), { fieldResults }); }
      fieldResults.push({ f, ok: true });
    }
    mark(5, "ok");
    const extra = Object.keys(extracted).filter((k) => !required.includes(k)).sort();
    if (extra.length) return Object.assign(fail(6, `unexpected extra fields: [${extra.map((k) => `'${k}'`).join(", ")}]`), { fieldResults });
    mark(6, "ok");
    const executorId = delivery.executor_agent_id ?? "";
    const digest = await sha256Hex(evidencePreimage(taskId, executorId, inputText, extracted));
    mark(7, "ok");
    return { result: { outcome: "pass", evidence_digest: digest, failure_reason: null, blocked_reason: null, ...base }, steps, fieldResults };
  }

  const api = { CHECKER_REF, canonicalJson, parseFields, sha256Hex, evidencePreimage, check };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AgentProofChecker = api;
})(typeof window !== "undefined" ? window : globalThis);
