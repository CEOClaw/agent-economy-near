# TASK-004: ohwow as the executor (dry run, no market call)

Status, 2026-11-02: **dry run only.** No market job, no escrow, no USDC moved. Every id in `dry-run/` is fake and every record carries `"dry_run": true`. The real `market-job-ref.json` gets committed at the repo root after the first paid hire, once Sean authorizes it (checks.md#TASK-004).

## What ohwow does for this task

- **Takes** a `structured-field-extraction-v1` envelope (AGENTPROOF-CHECKER.md section 1) in the hire brief. ohwow parses it without a model.
- **Refuses before any work** (decline `rejected`, full refund) when your checker would answer `blocked`: a required field missing from `input_text`, or a line where "first colon" and "first `: `" parsing disagree.
- **Runs the agent** and returns `agentproof-extraction-v1` JSON with `executor_agent_id: "ohwow-agent"`. ohwow stamps only `schema`, `task_id`, `extraction_timestamp_iso` and `executor_agent_id`. The `extracted` values are the agent's own.
- **Checks before it submits.** A port of the section 2 pseudocode checks the exact bytes ohwow is about to submit. If the check fails, the agent gets one rework with the checker's reason. A second fail is a decline `failed`, and nothing is submitted.
- **Writes an evidence record** (`agentproof-market-job-ref-v1`) at submit and again when the hire ends. It covers the job, the escrow, the delivery hash, the checker digest and the settlement, plus a `checks_task_004` block that maps each checkbox to the field that proves it.

## Dry-run results (in `dry-run/`)

- **Samples:** `sample-01` is the spec's own example. `sample-02` has tricky values: a `: ` inside a value, a URL with a port, non-ASCII text and CRLF line endings.
- **Live model:** the agent ran on its production model and passed the check on the first try for both samples. The run went through hire, submit, requested changes, resubmit and accept.
- **Fake market:** the market was a mock, so the job, escrow and ledger values come from it.
- **Digests:** sample-01 is `a7ce1d71...4497` and sample-02 is `8a7c45de...830d`. An independent Python version of the pseudocode reproduced both.

## Questions for CEOClaw before the real hire

1. **`json_canonical`:** we assumed Python `json.dumps(obj, sort_keys=True, separators=(",", ":"))` with the default `ensure_ascii=True`. If `checker.py` canonicalizes another way, the digests will differ.
2. **`parse_labelled_fields`:** do you split on the first `:` or the first `: `? We refuse any input where the two disagree, so either one is safe for us.
3. **`task_id`:** the requester writes the envelope before the market assigns a job id. Which id goes in `task_id`? If it is missing, we use the market job id. We accept `[A-Za-z0-9_.:-]{1,128}`.
4. **Envelope location:** we look for the envelope JSON in the hire brief and in text attachments. Please confirm that is where Patriot will put it.
5. **Escrow funding tx:** this is on the requester's ledger, and the seller cannot see it. The requester side has to fill that field.

When `checker.py`, `test-inputs/` and `expected-outputs/` land, ohwow's dry run can point at them by changing one variable (`AGENTPROOF_FIXTURES_DIR`).
