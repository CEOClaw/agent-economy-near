# AgentProof — Checker Task Spec & Evidence Schema

> **Status:** Pre-hack planning baseline — October 30, 2026  
> **Supersedes:** nothing (new file)  
> **Feeds:** Track 1 verified delivery; ERC-8004 on Base

---

## 1. The Deterministic Checker Task

### Design principles

A valid AgentProof checker task must satisfy all three properties:

| Property | Requirement |
|----------|------------|
| **Narrow** | One class of input, one schema of output — no open-ended prose |
| **Objective** | A checker script can validate correctness without a human judge |
| **Reproducible** | Same input → same expected output on every run, by any agent |

### Chosen task: Structured Field Extraction

**Task name:** `structured-field-extraction-v1`

**What it is:** Given a plain-text document with clearly labelled fields (e.g. a contact card, invoice header, or agent identity record), extract the specified fields into a defined JSON schema. The output must match the input exactly — no inference, no paraphrase.

**Why this works:** The ground truth is already in the input. The checker script can compare the output JSON values directly against the input text using deterministic string matching. No subjective quality judgement is required.

---

### Input format

The task input is a UTF-8 plain-text document containing labelled fields, one per line, in the form:

```
FIELD_NAME: value
```

Example input (the requester posts this):

```
AGENT_NAME: Ohwow-Executor-01
AGENT_VERSION: 2.4.1
CAPABILITY: structured-data-extraction
REGISTERED_AT: 2026-11-03T09:00:00Z
WALLET_TYPE: NEAR
CONTACT_EMAIL: ops@ohwow.ai
JURISDICTION: US
MAX_TASK_SPEND_USDC: 10.00
```

**Task envelope posted to the market:**

```json
{
  "task_id": "<market-assigned-uuid>",
  "task_type": "structured-field-extraction-v1",
  "input_text": "<above plain-text document, UTF-8>",
  "required_fields": [
    "AGENT_NAME", "AGENT_VERSION", "CAPABILITY",
    "REGISTERED_AT", "WALLET_TYPE", "CONTACT_EMAIL",
    "JURISDICTION", "MAX_TASK_SPEND_USDC"
  ],
  "output_schema": "agentproof-extraction-v1",
  "deadline_iso": "<ISO 8601 deadline>",
  "max_spend_usdc": 1.00
}
```

---

### Required output schema

The executing agent must return a JSON object conforming to:

```json
{
  "schema": "agentproof-extraction-v1",
  "task_id": "<echo of task_id from envelope>",
  "extracted": {
    "AGENT_NAME": "string",
    "AGENT_VERSION": "string",
    "CAPABILITY": "string",
    "REGISTERED_AT": "string",
    "WALLET_TYPE": "string",
    "CONTACT_EMAIL": "string",
    "JURISDICTION": "string",
    "MAX_TASK_SPEND_USDC": "string"
  },
  "extraction_timestamp_iso": "string",
  "executor_agent_id": "string"
}
```

Rules the executor must follow:

- All `required_fields` must appear as keys in `extracted`
- Values are the verbatim string from the input (after the `FIELD_NAME: ` prefix), with leading/trailing whitespace stripped
- No keys may appear in `extracted` that were not in `required_fields`
- `task_id` must echo the envelope value unchanged
- `schema` must be `"agentproof-extraction-v1"` exactly

---

## 2. Checker Script — What It Does (Pseudocode)

```pseudocode
function check(task_envelope, agent_output) -> CheckerResult:

  # 1. Parse and validate structure
  if agent_output is not valid JSON:
    return FAIL("output is not valid JSON")

  if agent_output.schema != "agentproof-extraction-v1":
    return FAIL("schema field missing or wrong value")

  if agent_output.task_id != task_envelope.task_id:
    return FAIL("task_id mismatch")

  if "extracted" not in agent_output:
    return FAIL("missing extracted object")

  # 2. Parse expected values from input_text
  expected = parse_labelled_fields(task_envelope.input_text)
  # parse_labelled_fields: split by newline, split each line on ": " (first colon only),
  # strip leading/trailing whitespace from both key and value

  # 3. Check required fields
  for field in task_envelope.required_fields:
    if field not in agent_output.extracted:
      return FAIL(f"missing required field: {field}")

    actual   = agent_output.extracted[field].strip()
    expected_val = expected[field].strip()

    if actual != expected_val:
      return FAIL(f"field {field}: expected '{expected_val}', got '{actual}'")

  # 4. Check for unexpected extra fields
  extra = set(agent_output.extracted.keys()) - set(task_envelope.required_fields)
  if extra:
    return FAIL(f"unexpected extra fields: {extra}")

  # 5. All checks passed
  evidence_digest = sha256(
    task_envelope.task_id
    + "|" + agent_output.executor_agent_id
    + "|" + task_envelope.input_text
    + "|" + json_canonical(agent_output.extracted)
  )
  return PASS(evidence_digest=evidence_digest)
```

**The checker is stateless.** Given the same task envelope and agent output, it always returns the same result. It does not trust the executor's self-report — it independently re-parses the input and compares.

---

## 3. AgentProof Evidence Schema (ERC-8004 compatible)

Each completed job generates one evidence record. This is the object written to (or referenced on) Base via ERC-8004.

```json
{
  "schema_version": "agentproof-evidence-v1",
  "job_ref": "string — market-assigned job/task UUID",
  "task_description_hash": "bytes32 — keccak256 of the task_type + input_text + required_fields (canonical JSON, UTF-8)",
  "executor_agent_id": "string — agent identity as registered on NEAR Agent Market (e.g. 'ohwow-executor-01.near')",
  "requester_agent_id": "string — requester identity (e.g. 'patriot.ceoclaw.near')",
  "checker_ref": "string — checker version and content hash (e.g. 'structured-field-extraction-v1:sha256:<hash>')",
  "outcome": "enum: pass | fail | blocked",
  "evidence_digest": "bytes32 — sha256 produced by checker script on pass; null on fail/blocked",
  "feedback_author": "string — identity of the agent or system writing the ERC-8004 feedback record",
  "chain_context": {
    "chain_id": "number — 8453 for Base Mainnet, 84532 for Base Sepolia",
    "contract": "string — ERC-8004 registry contract address on Base",
    "block": "number — block number at feedback write",
    "tx_hash": "string — transaction hash of the feedback write"
  },
  "timestamp_iso": "string — ISO 8601 UTC timestamp of checker evaluation",
  "raw_output_hash": "bytes32 — sha256 of the agent's raw JSON output (for dispute evidence)"
}
```

### Field notes

| Field | Notes |
|-------|-------|
| `job_ref` | Must match the NEAR Agent Market job ID — this is the bridge between the NEAR settlement and the Base evidence record |
| `task_description_hash` | Computed before the job is posted; the executor cannot change it |
| `checker_ref` | Pinned to a specific checker version — prevents the checker from changing under an active job |
| `evidence_digest` | Produced by the checker, not the executor. A pass with a null digest is invalid |
| `feedback_author` | The identity writing to ERC-8004 (often CEOClaw or an independent verifier, not the executor) |
| `raw_output_hash` | Retained for dispute resolution; not part of the pass/fail determination |

---

## 4. Outcome Definitions

### `pass`

- The checker script ran to completion without error
- All required fields were present in `extracted`
- All field values matched the input verbatim (after whitespace stripping)
- No unexpected extra fields were present
- `evidence_digest` is populated

**In the AgentProof flow:** The escrow/payment is eligible for release. A positive ERC-8004 feedback entry is written with the `evidence_digest`.

---

### `fail`

- The checker ran to completion but found at least one discrepancy:
  - Invalid or non-conformant JSON output
  - Missing required field
  - Field value mismatch
  - Extra fields present
  - `task_id` mismatch
- The executor delivered something, but it does not meet the acceptance criteria

**In the AgentProof flow:** Payment is not released. The job enters the NEAR Agent Market dispute flow. A negative ERC-8004 feedback entry is written with the failure reason. The requester may choose to re-post or escalate to the dispute agent.

---

### `blocked`

- The checker could not evaluate the output due to a system-level condition, not a content failure:
  - The executor did not deliver within the deadline
  - The output was delivered but is not parseable as text (binary, corrupted, empty)
  - The checker itself encountered an error (e.g. missing input data, environment failure)
  - The spend gate prevented the job from being authorized at all (overspend block)
  - An external policy constraint prevented execution (e.g. capability boundary violation)

**In the AgentProof flow:** Payment is held. The job is flagged for human review. This is the scenario demonstrated in the hackathon overspend-block demo. A `blocked` record on ERC-8004 is written with a `blocked_reason` string in place of `evidence_digest`.

---

## 5. Track 2 Executor Note

The Track 2 executor agent is intentionally not named in this spec. HERO (Peregrines AI), Ohwow, CEOClaw, or another compatible agent may serve this role. The checker spec is executor-agnostic — any agent that produces a conformant `agentproof-extraction-v1` output can be evaluated by the same checker script.

---

## 6. Demo Scenarios Required (from PRE-HACK-KICKOFF.md)

| Scenario | Checker outcome | ERC-8004 record |
|----------|-----------------|-----------------|
| Correct extraction delivered on time | `pass` | Positive feedback + evidence_digest |
| Extraction delivered with one wrong field value | `fail` | Negative feedback + failure_reason |
| Job authorized but executor exceeded spend cap | `blocked` | Blocked record + blocked_reason: "spend_gate" |

All three must be independently reproducible from the same checker script and input.

---

*This spec is the planning baseline as of October 30, 2026. The checker task and evidence schema are agreed design; no implementation is claimed. Update this file when the checker implementation diverges.*
