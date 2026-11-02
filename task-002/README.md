# TASK-002 — AgentProof Deterministic Checker

## What It Does

`checker.py` implements the `structured-field-extraction-v1` checker protocol from
[AGENTPROOF-CHECKER.md](../AGENTPROOF-CHECKER.md).

Given a **task envelope** (the job posted to the market) and a **delivery JSON** (the
executor's response), the checker deterministically validates whether the delivery
matches the ground truth embedded in the envelope, then returns a single structured
result:

```json
{
  "outcome":         "pass" | "fail" | "blocked",
  "evidence_digest": "<sha256hex>" | null,
  "failure_reason":  "<string>"    | null,
  "blocked_reason":  "<string>"    | null,
  "task_id":         "<string>",
  "checker_ref":     "structured-field-extraction-v1:1.0.0"
}
```

The checker is **stateless** — the same inputs always produce the same output.
No database, no network calls.

---

## How to Run

```bash
python3 checker.py <envelope.json> <delivery.json>
```

Examples:

```bash
# Scenario 1 — correct extraction (expect: pass)
python3 task-002/checker.py \
  task-002/test-inputs/envelope-01.json \
  task-002/expected-outputs/sample-01-pass.json

# Scenario 2 — wrong field value (expect: fail)
python3 task-002/checker.py \
  task-002/test-inputs/envelope-01.json \
  task-002/expected-outputs/sample-01-fail.json

# Scenario 3 — spend gate exceeded (expect: blocked)
python3 task-002/checker.py \
  task-002/test-inputs/envelope-02.json \
  task-002/expected-outputs/sample-02-blocked.json
```

---

## Run All Tests

```bash
bash task-002/run_tests.sh
```

Expected output:

```
=== AgentProof TASK-002 Test Suite ===

Scenario 1/3: sample-01 correct extraction (expect PASS) ... ✅ pass
Scenario 2/3: sample-01 wrong CONTACT_EMAIL  (expect FAIL) ... ✅ fail
Scenario 3/3: sample-02 spend gate overage   (expect BLOCKED) ... ✅ blocked

=== Results: 3 passed, 0 failed ===
ALL SCENARIOS CORRECT ✅
```

---

## Demo Scenarios

| # | Scenario | Envelope | Delivery | Expected outcome |
|---|----------|----------|----------|-----------------|
| 1 | Correct extraction delivered on time | `envelope-01.json` | `sample-01-pass.json` | `pass` + `evidence_digest` |
| 2 | One field value wrong | `envelope-01.json` | `sample-01-fail.json` | `fail` + `failure_reason` |
| 3 | Executor exceeded spend cap | `envelope-02.json` | `sample-02-blocked.json` | `blocked` + `blocked_reason` |

Scenario 3 uses `envelope-02.json` which has `max_spend_usdc: 0.25`. The blocked
delivery signals `requested_spend_usdc: 5.00`, triggering the spend-gate condition.

A fourth fixture (`sample-02-pass.json`) is included to verify the checker correctly
approves a valid delivery against envelope-02 when within budget.

---

## Evidence Digest

On a `pass`, the checker computes:

```
evidence_digest = sha256(
    task_id
    + "|" + executor_agent_id
    + "|" + input_text
    + "|" + canonical_json(extracted)
)
```

where `canonical_json` is `json.dumps(obj, sort_keys=True, separators=(",",":"), ensure_ascii=True)`.

This digest is the value written to the ERC-8004 feedback record on Base.

---

## Parsing Rules

- `input_text` is split on newlines (`str.splitlines()`)
- Each line is split on the **first** `": "` (colon-space) only
- Both key and value are stripped of leading/trailing whitespace
- Lines without `": "` are silently skipped

---

## Environment Variable

`AGENTPROOF_FIXTURES_DIR` — override the base directory used by `run_tests.sh`
to locate `test-inputs/` and `expected-outputs/`. Defaults to the directory
containing `run_tests.sh`.

```bash
AGENTPROOF_FIXTURES_DIR=/path/to/custom/fixtures bash task-002/run_tests.sh
```

---

## Files

```
task-002/
├── checker.py                          ← deterministic checker (main artifact)
├── README.md                           ← this file
├── run_tests.sh                        ← automated test runner
├── test-inputs/
│   ├── sample-01.txt                   ← source plain-text document #1
│   ├── sample-02.txt                   ← source plain-text document #2
│   ├── envelope-01.json                ← task envelope for sample-01
│   └── envelope-02.json                ← task envelope for sample-02 (low spend cap)
└── expected-outputs/
    ├── sample-01-pass.json             ← correct delivery for sample-01
    ├── sample-01-fail.json             ← wrong CONTACT_EMAIL (triggers fail)
    ├── sample-02-pass.json             ← correct delivery for sample-02
    └── sample-02-blocked.json          ← spend-gate delivery (triggers blocked)
```
