# AgentProof — Execution Graph
**Framework:** CEOClaw Graph-Based Execution  
**Project:** NEAR AI Hackathon · Nov 1–14, 2026  
**Baseline:** October 31, 2026 (pre-hackathon planning)  
**Status:** All tasks PENDING — implementation begins Nov 1  
**Authoritative records:** GitHub Issues and PRs  
**This file:** Coordination overlay — read at session start, update on task state change

---

## Task Schema

```
TASK-{id}: {title}
  type:        research | code | verify | deploy | decision
  owner:       {agent or human} — mark "Proposed" if not yet confirmed
  inputs:      [task IDs or named external sources]
  outputs:     [named artifacts]
  criteria:    see checks.md#TASK-{id}
  max_retry:   3  (payments/wallets/production: renewed auth required after failure)
  auth:        yes | no  (human sign-off required before execution)
  parallel:    yes | no
  github:      issue or PR URL (update when created)
  status:      pending | ready | running | review | verified | blocked | failed
```

---

## WORKSTREAM 0 — Eligibility & Setup (blocks all implementation)

```
TASK-000: Verify hackathon eligibility, account requirements, and pre-existing code policy
  type:     research
  owner:    CEOClaw + Sean
  inputs:   Official NEAR hackathon rules (URL to be confirmed), Agent Market account docs
  outputs:  eligibility-confirmation.md
  criteria: checks.md#TASK-000
  auth:     no
  parallel: no — BLOCKS ALL IMPLEMENTATION TASKS
  status:   pending
```

---

## WORKSTREAM 1 — Core Agent Commerce (Critical Path)

```
TASK-001: Confirm NEAR Agent Market API and payment mechanics
  type:     research
  owner:    Proposed — Jesus Onoro (CEOClaw assists)
  inputs:   NEAR-MARKET-RESEARCH.md, live NEAR docs, Jesus's environment
  outputs:  confirmed-api-spec.md (job/bid/assignment endpoints, USDC floor, account flow, escrow behavior)
  criteria: checks.md#TASK-001
  depends:  TASK-000
  auth:     no
  parallel: no — blocks TASK-004, TASK-008
  status:   pending

TASK-002: Implement structured-field-extraction-v1 checker
  type:     code
  owner:    CEOClaw
  inputs:   AGENTPROOF-CHECKER.md (spec complete), TASK-001 task schema
  outputs:  checker.py, test-inputs/, expected-outputs/
  criteria: checks.md#TASK-002
  depends:  TASK-000 (partial TASK-001 for task envelope format)
  auth:     no
  parallel: yes — may run alongside TASK-001 research
  status:   pending

TASK-003: Implement evidence schema writer
  type:     code
  owner:    CEOClaw
  inputs:   AGENTPROOF-CHECKER.md evidence schema, ERC8004-IDENTITY-PLAN.md
  outputs:  evidence-writer.py producing agentproof-evidence-v1 JSON
  criteria: checks.md#TASK-003
  depends:  TASK-000
  auth:     no
  parallel: yes — may run alongside TASK-001 and TASK-002
  status:   pending

TASK-004: First minimal NEAR market transaction
  type:     code
  owner:    Proposed — Jesus Onoro (CEOClaw coordinates)
  inputs:   confirmed-api-spec.md (TASK-001), Sean's explicit spend authorization
  outputs:  market-job-ref.json (real NEAR job ID, escrow record, USDC tx reference)
  criteria: checks.md#TASK-004
  depends:  TASK-000, TASK-001
  auth:     YES — USDC transfer. Renewed auth required if first attempt fails.
  parallel: no
  status:   pending

TASK-005: Independent checker evaluation against market job
  type:     verify
  owner:    CEOClaw
  inputs:   checker.py (TASK-002), market job executor output (TASK-004)
  outputs:  checker-result.json (pass/fail/blocked + evidence_digest if pass)
  criteria: checks.md#TASK-005
  depends:  TASK-002, TASK-004
  auth:     no
  parallel: no
  status:   pending
```

---

## WORKSTREAM 2 — AgentProof Verification Scenarios

```
TASK-006: Scenario A — Successful delivery
  type:     verify
  owner:    CEOClaw
  inputs:   checker-result.json with outcome=pass (from TASK-005)
  outputs:  scenario-a-evidence.json
  criteria: checks.md#TASK-006
  depends:  TASK-005
  auth:     no
  parallel: no
  status:   pending

TASK-007: Scenario B — Incorrect delivery (checker fails)
  type:     verify
  owner:    CEOClaw
  inputs:   intentionally incorrect extraction submitted to checker
  outputs:  scenario-b-evidence.json (checker fail record, specific mismatch reason)
  criteria: checks.md#TASK-007
  note:     What happens in the marketplace after checker failure is described based on
            actual API behavior — do not assume automatic payment hold or refund.
  depends:  TASK-006
  auth:     no
  parallel: no
  status:   pending

TASK-008: Scenario C — Spend gate blocks unauthorized commitment
  type:     code+verify
  owner:    Proposed — Jesus Onoro (spend gate), CEOClaw (verification)
  inputs:   confirmed spend gate implementation, over-limit request payload
  outputs:  scenario-c-evidence.json (blocked record, log showing commitment did not occur)
  criteria: checks.md#TASK-008
  note:     Spend gate testing is a core AgentProof demonstration regardless of
            whether second hire or optional integrations are deferred.
  depends:  TASK-001
  auth:     no (the gate itself blocks spending — no real funds move)
  parallel: yes — may run alongside TASK-006 after TASK-001 confirmed
  status:   pending
```

---

## WORKSTREAM 3 — ERC-8004 Integration (separate from core verification)

```
TASK-009: Mint fresh CEOClaw ERC-8004 identity on Base
  type:     deploy
  owner:    CEOClaw (API) + Sean (wallet signature)
  inputs:   ERC8004-IDENTITY-PLAN.md metadata, Sean's Coinbase wallet
  outputs:  erc8004-ceoclaw-identity.json (token ID, certificate URL)
  criteria: checks.md#TASK-009
  note:     Independent of NEAR work — may be executed any time Sean approves.
            Fresh mint on Base; not recovering Lazarus token #29,998.
  depends:  none (parallel, independent)
  auth:     YES — NFT mint requires Sean's wallet signature. No retry without renewed auth.
  parallel: yes
  status:   pending

TASK-010: Write ERC-8004 feedback after verified job
  type:     code+deploy
  owner:    CEOClaw
  inputs:   scenario-a-evidence.json (TASK-006), CEOClaw token (TASK-009),
            evidence-writer.py (TASK-003), Sean's explicit Base tx authorization
  outputs:  erc8004-feedback-tx.json (Base tx hash, job_ref, evidence_digest)
  criteria: checks.md#TASK-010
  note:     This is a separate integration task — not a prerequisite for
            successful core verification (TASK-005 through TASK-008).
  depends:  TASK-003, TASK-006, TASK-009
  auth:     YES — Base transaction. Renewed auth required if first attempt fails.
  parallel: no
  status:   pending
```

---

## WORKSTREAM 4 — dPlaza Integration (Hackathon MVP)

```
TASK-011: Create dPlaza service listing for AgentProof demo
  type:     code
  owner:    Proposed — Jesus Onoro
  inputs:   DPLAZA-LISTING-SPEC.md, confirmed market job format (TASK-001)
  outputs:  dplaza-listing.json (listing ID, acceptance criteria reference)
  criteria: checks.md#TASK-011
  note:     Hackathon MVP only. dPlaza inventory NFT ≠ ERC-8004 registration —
            this distinction must be documented in the listing output.
            Longer-term dPlaza/ERC-8004 product roadmap is separate.
  depends:  TASK-004
  auth:     no
  parallel: no
  status:   pending
```

---

## WORKSTREAM 5 — Peregrines External Executor (Optional, Track 2)

```
TASK-012: Verify Track 2 eligibility and confirm Guy's participation
  type:     research
  owner:    CEOClaw + Sean
  inputs:   official hackathon rules, Guy's response to repo invitation
  outputs:  track2-eligibility.md (eligible yes/no; Guy confirmed yes/no)
  criteria: checks.md#TASK-012
  note:     Executor is intentionally not named until Guy confirms. HERO, Ohwow,
            or another compatible agent may fill this role.
  depends:  TASK-000
  auth:     no
  parallel: yes
  status:   pending

TASK-013: Define external executor adapter interface
  type:     research
  owner:    CEOClaw (spec) + Proposed — Guy Savage (HERO API details)
  inputs:   PRE-HACK-KICKOFF.md adapter spec, TASK-012 confirmed, TASK-001 API
  outputs:  adapter-spec.md (request/response format, auth, evidence format)
  criteria: checks.md#TASK-013
  depends:  TASK-012
  auth:     no
  parallel: yes
  status:   pending

TASK-014: Implement and verify external executor adapter (OPTIONAL)
  type:     code+verify
  owner:    Proposed — Guy Savage (Peregrines AI); CEOClaw (verification)
  inputs:   adapter-spec.md (TASK-013), HERO/executor implementation
  outputs:  adapter.py + scenario-d-evidence.json
            (authorized call, rejected prohibited request, policy evidence)
  criteria: checks.md#TASK-014
  note:     Label extent to which policy enforcement is independently verified
            vs self-reported by executor. Only proceed if TASK-005 is stable
            by Nov 7 gate.
  depends:  TASK-013, TASK-005
  auth:     no
  parallel: no
  status:   pending
```

---

## Dependency Summary

```
000 ──────────────────────────── blocks all implementation tasks
001 (research) ─────────────────┬── 004 (market tx, auth) ──── 005 (checker eval)
                                 └── 008 (spend gate, parallel)     │
002 (checker impl) ──────────────────────────────────────── 005     │
003 (evidence writer) ─────────────────────────────────────────── 010 (ERC-8004 tx)
                                                                   │
005 ──── 006 (Scenario A) ──── 007 (Scenario B)                    │
005 ──── 006 ─────────────────────────────────────────────── 010   │
009 (ERC-8004 mint, auth, PARALLEL) ────────────────────── 010
004 ──── 011 (dPlaza listing)
012 (Track 2 eligibility) ──── 013 (adapter spec) ──── 014 (optional)
```

**Critical path:** 000 → 001 → 004 → 005 → 006

---

## November 7 Fallback

If TASK-004 (first real market transaction) is not verified by November 7:

- **Preserve:** TASK-000 through TASK-003, TASK-005 (if runnable against mock), TASK-008
- **Defer:** TASK-007, TASK-010, TASK-011, TASK-013, TASK-014
- **Submit baseline:** One completed market transaction + independent checker verification + spend gate block demo
- **Do not:** Convert the baseline into mock transactions to fill gaps

---

## Recovery Protocol

1. Read `progress.md` to understand current state.
2. Find tasks with status `ready` (all dependencies `verified`).
3. Run the highest-priority ready task.
4. On failure: increment retry count, append failure note, re-queue if `retry < max_retry`.
5. On `max_retry` exceeded: set status `blocked`, escalate to Sean.
6. **Exception:** Tasks with `auth: yes` involving payments, wallets, or production infrastructure — escalate immediately on any failure. Do not retry without renewed authorization.
7. On completion: set status `verified`, update `progress.md`, update dependent task statuses.

---

*This graph is a coordination overlay. GitHub Issues and PRs are authoritative. Update this file when task status changes.*
