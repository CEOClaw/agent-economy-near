# AgentProof — Acceptance Criteria
> **November 1 acceptance-gate notice:** These checks are requirements, not reported test results. Each completed item must point to reproducible output, GitHub evidence or verified transaction data. See [README.md](README.md) for current scope. A checker failure is not proof of an escrow refund; an identity mint is not proof of work quality.

**Framework:** CEOClaw Graph-Based Execution  
**Companion to:** graph.md  
**Principle:** Every criterion must be checkable without a human judge where possible. Where human judgment is required, say so explicitly.

---

## TASK-000: Verify hackathon eligibility

- [ ] Official hackathon rules URL identified and read
- [ ] Eligible submission tracks confirmed (list them)
- [ ] Pre-existing code policy documented — what is permitted, what is not
- [ ] Account creation and adoption requirements for NEAR Agent Market confirmed
- [ ] Payment mechanics confirmed (USDC network, wallet type, minimum amounts if known)
- [ ] Time zone for competition window confirmed
- [ ] Output: `eligibility-confirmation.md` committed to repo
- **Human review required:** Sean confirms the eligibility document before any implementation begins

---

## TASK-001: Confirm NEAR Agent Market API

- [ ] New job/bid/assignment/escrow API (not old service-registry) confirmed as the current interface
- [ ] Actual job creation endpoint tested (not just documented)
- [ ] Actual bid/acceptance flow tested
- [ ] USDC minimum escrow floor confirmed (dollar amount, not "unknown")
- [ ] Human account adoption requirement confirmed — what steps, what wallet type
- [ ] Escrow release conditions documented based on actual API behavior
- [ ] Dispute/failure path documented based on actual API behavior (not assumed)
- [ ] Output: `confirmed-api-spec.md` committed to repo
- [ ] Jesus's existing code version identified — old or new API?
- **Human review required:** Sean and Jesus confirm the spec before TASK-004 begins

---

## TASK-002: Implement checker (structured-field-extraction-v1)

- [ ] `checker.py` committed to repo on a feature branch
- [ ] Input format: UTF-8 plain text, `FIELD: value` per line
- [ ] Output format: JSON matching `agentproof-extraction-v1` schema
- [ ] **Determinism test:** Same input run 3 times produces identical output (automated test)
- [ ] **Pass case:** All fields extracted correctly → `outcome: pass`, `evidence_digest` populated
- [ ] **Fail case:** At least one field value wrong → `outcome: fail`, `failure_reason` names the field
- [ ] **Blocked case:** Missing required field or malformed input → `outcome: blocked`, `blocked_reason` explains
- [ ] Test inputs and expected outputs committed to `test-inputs/` and `expected-outputs/`
- [ ] No model inference calls in the checker — purely deterministic code
- [ ] PR opened, tests passing in CI or documented run
- **Automated check:** Run `python checker.py test-inputs/sample-01.txt` — output must match `expected-outputs/sample-01.json` byte-for-byte (modulo timestamp field)

---

## TASK-003: Implement evidence schema writer

- [ ] `evidence-writer.py` committed to repo
- [ ] Produces valid `agentproof-evidence-v1` JSON with all required fields:
  - `job_ref` (links to NEAR market job UUID)
  - `task_description_hash` (SHA-256 of task spec)
  - `executor_agent_id`
  - `requester_agent_id`
  - `checker_ref` (script name + version)
  - `outcome` (pass/fail/blocked)
  - `evidence_digest` (SHA-256 of checker output, if pass)
  - `failure_reason` or `blocked_reason` (if fail/blocked)
  - `feedback_author`
  - `chain_context`
  - `timestamp_iso`
- [ ] Schema validation script committed alongside
- [ ] Runs without errors on a sample input
- **Automated check:** `python evidence-writer.py --validate sample.json` exits 0

---

## TASK-004: First minimal NEAR market transaction

- [ ] Real NEAR market job created using confirmed API (TASK-001)
- [ ] Job reference (UUID or on-chain ID) independently retrievable from NEAR network — not just self-reported
- [ ] Escrow funded with USDC — transaction confirmed on-chain
- [ ] Executor receives and acknowledges the job
- [ ] Delivery submitted by executor
- [ ] Settlement path documented (pass or fail — either is acceptable evidence)
- [ ] All of the above committed to `market-job-ref.json`
- **Human checkpoint before execution:** Sean explicitly approves USDC amount and target wallet. No retry without renewed authorization if first attempt fails.
- **Human review after:** Sean confirms the on-chain record before TASK-005 proceeds

---

## TASK-005: Independent checker evaluation

- [ ] Checker (`checker.py`) run against executor's actual delivery from TASK-004
- [ ] Checker run is independently reproducible: input + checker version → same result
- [ ] Result JSON committed to `checker-result.json`
- [ ] Result does NOT rely on executor's self-report — checker operates on the delivery artifact directly
- [ ] Outcome is one of: `pass`, `fail`, or `blocked` (no ambiguous states)
- **Automated check:** Re-run `python checker.py <delivery>` — result must match `checker-result.json`

---

## TASK-006: Scenario A — Successful delivery

- [ ] Checker result = `pass`
- [ ] `scenario-a-evidence.json` committed with all schema fields populated
- [ ] Evidence independently reproducible: given same delivery + checker version, same evidence_digest
- [ ] What happened in the marketplace (payment released or not) documented based on actual API behavior — not assumed
- **Demonstration criterion:** A judge who runs `python checker.py <delivery>` gets the same outcome

---

## TASK-007: Scenario B — Incorrect delivery

- [ ] Intentionally incorrect extraction submitted (at least one field value wrong)
- [ ] Checker result = `fail`, `failure_reason` identifies the specific mismatched field
- [ ] `scenario-b-evidence.json` committed
- [ ] Marketplace behavior after checker fail documented based on actual NEAR market API behavior — do not assert automatic payment hold or refund unless the API confirms it
- [ ] Scenario independently reproducible
- **Demonstration criterion:** Same incorrect input → same fail outcome on repeated runs

---

## TASK-008: Scenario C — Spend gate blocks unauthorized commitment

- [ ] Spend gate implementation identified (from Jesus or implemented fresh)
- [ ] Over-limit request submitted to the spend gate
- [ ] Gate returns explicit rejection (not silent failure)
- [ ] Log entry or on-chain record shows the unauthorized financial commitment did not occur
- [ ] `scenario-c-evidence.json` committed with: requested amount, permitted maximum, gate decision, evidence that commitment did not occur
- [ ] Scenario independently reproducible
- [ ] This scenario stands alone — not dependent on TASK-006 completion
- **No real USDC moved in this test** — the gate blocks before any transfer

---

## TASK-009: Mint CEOClaw ERC-8004 identity

- [ ] Sean's wallet signature obtained (not simulated)
- [ ] Token minted on Base mainnet (not testnet) at contract `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- [ ] Token ID confirmed on Basescan
- [ ] Certificate page loads at `https://8004.way.je/agent/base/{tokenId}`
- [ ] Metadata matches `ERC8004-IDENTITY-PLAN.md` (name: CEOClaw, harness: OpenClaw, endpoints listed)
- [ ] `erc8004-ceoclaw-identity.json` committed with token ID and certificate URL
- [ ] This is a fresh mint — not a legacy registration
- **Human checkpoint:** Sean signs with Coinbase wallet. No retry without renewed authorization.

---

## TASK-010: Write ERC-8004 feedback after verified job

- [ ] `evidence-writer.py` produces valid feedback JSON linked to Scenario A job_ref
- [ ] Base transaction submitted and confirmed on-chain
- [ ] `job_ref` in feedback matches NEAR market job ID from TASK-004
- [ ] `evidence_digest` in feedback matches checker output from TASK-006
- [ ] `feedback_author` = CEOClaw token ID from TASK-009
- [ ] Transaction hash committed to `erc8004-feedback-tx.json`
- **Human checkpoint before tx:** Sean authorizes Base transaction. No retry without renewed authorization.

---

## TASK-011: dPlaza service listing

- [ ] Listing created on dPlaza (URL or ID documented)
- [ ] Acceptance criteria in listing match `AGENTPROOF-CHECKER.md` checker spec exactly
- [ ] Listing explicitly notes that dPlaza inventory NFT ≠ ERC-8004 agent identity registration
- [ ] `dplaza-listing.json` committed
- [ ] Longer-term dPlaza/ERC-8004 product roadmap noted as separate from this hackathon MVP
- **Human review:** Jesus confirms listing before it goes live

---

## TASK-012: Verify Track 2 eligibility

- [ ] Official rules checked for external executor integration eligibility
- [ ] Guy's participation status confirmed (accepted invite or responded)
- [ ] `track2-eligibility.md` committed with yes/no determination and reasoning
- **Human decision:** Sean decides whether to proceed with Track 2 based on this output

---

## TASK-013: External executor adapter spec

- [ ] `adapter-spec.md` committed with:
  - Request format (job/task IDs, requester + executor identity, capability params, acceptance criteria, max spend, deadline, optional data boundary policy, callback reference)
  - Response format (status, deliverable or secure pointer, timestamps, failure reason, evidence/receipt and signer, resource metadata)
  - Auth mechanism
  - What executor self-report proves vs what is independently verifiable
- [ ] Spec reviewed by Guy (or alternate executor owner) before implementation begins
- [ ] Executor is labeled in the spec but not assumed — any compatible agent may fulfill it

---

## TASK-014: External executor adapter (optional)

- [ ] Adapter implementation committed on feature branch
- [ ] Authorized call to executor succeeds and returns a valid response
- [ ] Prohibited request rejected by executor's governance layer
- [ ] Policy evidence returned and committed
- [ ] Evidence labeled: "self-reported by executor" vs "independently verified by checker"
- [ ] `scenario-d-evidence.json` committed
- [ ] Scenario independently reproducible by a judge
- **Only proceed if:** TASK-005 is verified by Nov 7 AND Track 2 eligibility confirmed

---

## General Standards (apply to all tasks)

- A task is **verified** only when its acceptance tests and evidence are committed and independently reproducible
- A merged PR is not evidence of verification — it is a necessary precondition
- An approval to merge is not an approval to spend funds, mint tokens, or submit the hackathon entry
- "Independently reproducible" means: another person can follow the test instructions and reach the same outcome without access to our internal context
- Do not assert a capability is verified based only on the executor's self-report
- Label every evidence artifact with the task ID, date, and contributor

---

*Companion to graph.md. Update task criteria here when the checker spec or evidence schema changes.*
