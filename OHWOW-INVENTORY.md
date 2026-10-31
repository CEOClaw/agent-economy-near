# Ohwow Inventory: Background Infrastructure vs. Hackathon Work

> **Status:** Pre-hack inventory, October 31, 2026 (before the November 1 00:00 UTC build window)
> **Author:** Jesus Onoro (jesusonoro)
> **Purpose:** Answer, with evidence, what the repo labels `[COULD NOT VERIFY]` about Ohwow, and draw an explicit line between Ohwow background infrastructure (private, not submitted for judging) and the hackathon work that will live in this repo.
> **Label key (same as NEAR-MARKET-RESEARCH.md):** `[CONFIRMED]` = directly observed in live docs/API, checkable by anyone today · `[STATED BY TEAM]` = reported by Jesus; for Ohwow code this means pinned to a commit SHA in a private repository (see Verification below) · `[COULD NOT VERIFY]` = could not confirm

---

## 1. Baseline

| Component | Repository | Visibility | Baseline SHA | Where it runs |
|---|---|---|---|---|
| Ohwow cloud (ohwow.fun) | jesusonoro/ohwow.fun | Private | `c5344e6cf` | Vercel production. The production deployment on October 31, 2026 00:19 UTC is this SHA. |
| Ohwow runtime (local agent daemon) | ohwow-fun/ohwow | Private | `ef950eb2` | Operator's own machine, as the local daemon |

Every commit cited below is an ancestor of these baselines. All of it was built in October 2026 for Ohwow's own product.

**Window note (updated Oct 31 from the live rules).** The official HACKATHON.md (Q-001) counts work from the October 19 announcement, not from November 1; earlier commits are baseline. Several rows below are dated October 21, so by date they fall inside the window. They are still treated here as **background: private, not submitted for judging**, because only NEAR work in the submitted public repository is judged (Q-002, Q-003) and the Ohwow repositories stay private. The Ohwow piece that will be judged is a small public adapter built in this repo (section 4).

**Background IP.** Ohwow code is Jesus Onoro's background IP. No license (Apache, MIT or other) is granted by this document or by its use in the hackathon. Hackathon-created code in this repository is licensed as the team decides separately.

## 2. Verification

Both Ohwow repositories are private, so the SHAs below cannot be checked from this repo. Options offered to the team:

1. SHAs and paths as listed here (`[STATED BY TEAM]`).
2. A live walkthrough on request: the code at the baseline SHA, the tests, and the production deployment record.

What anyone can check today, without access: every NEAR Agent Market endpoint the Ohwow client calls exists in the live OpenAPI spec (section 3, row 1).

---

## 3. Capability inventory

| # | Capability | Evidence (paths, SHAs) | Deployed where | State at baseline | Label |
|---|---|---|---|---|---|
| 1 | NEAR Agent Market client on the **current** v2 API | `src/lib/marketplaces/near/client.ts` in ohwow.fun. Base URL `https://market.near.ai` (line 26). `market-legacy.near.ai` refused by host (lines 27, 151). Calls 13 endpoints (lines 200-324): `POST /v1/agents/register`, `PATCH /v1/agents/{id}`, `POST /v1/agents/{id}/pricing-plans`, `POST /v1/pricing-plans/{id}/make-default`, `POST /v1/agents/{id}/webhook/test`, `POST /v1/agents/me/adoption-code`, `GET /v1/agents/me/assignments`, `POST /v1/assignments/{id}/start`, `POST /v1/assignments/{id}/submit`, `POST /v1/assignments/{id}/decline`, `GET` and `POST /v1/assignments/{id}/messages`, `POST /v1/files`, `POST /v1/files/{id}/complete`. Commit `7f02b135d` (Oct 21). | Vercel production (code present) | No call to `/v1/services/*` anywhere. All 13 paths exist in the live spec (OpenAPI 2.0.0, 104 paths, fetched Oct 31). `GET /v1/services` returns 404. | Code: `[STATED BY TEAM]` · Paths exist live: `[CONFIRMED]` |
| 2 | Seller-side sell backend: listing provisioning, signed webhook receiver, assignment poller, brief extraction, pre-submit verifier gate, mapping of market events onto settlements | `src/lib/marketplaces/near/` (about 25 modules, about 3,900 lines with tests). Webhook route `src/app/api/marketplaces/near/webhook/[listingId]/route.ts` (HMAC over timestamp and raw body, 5 minute window, delivery dedupe). Schema: migration 722, commit `acf209c9f`. Backend: commit `7f02b135d`. NEAR hold handling: commit `a3e9bbfad`. | Vercel production (code present) | **Built and dormant.** The commit records "Tested against fixtures only; no call to the market was made. Worker cron not deployed." No Ohwow listing is live on the market at baseline. | `[STATED BY TEAM]` |
| 3 | First live market call and paid hire of the Ohwow listing (Ohwow's own product test, P0) | Provisioning script in progress in ohwow.fun (uncommitted at baseline). | Not yet | **In progress, pre-November 1, paid by Jesus personally.** This is a test of Ohwow's own product, not the hackathon transaction. TASK-004 still happens inside the build window. Job id: `TBD` · Settlement / tx reference: `TBD` | `[STATED BY TEAM]` |
| 4 | External spend gate: per-agent caps, human approval threshold, reserve before spend, settle or release after | Runtime `ohwow-fun/ohwow`: tables `04f750b6`, guard `61e643fe` (caps, approval, reserve/settle), A2A send gating `8b49126d`, priced MCP gating and A2A approval `0b962ff4`, budget and ledger routes `d5a55c10`, no retry of priced calls and block when the price rises above the approved amount `e00e6892`, budget route scoping `5bfb3f69`. All October 21. | Runtime main (operator's machine) | **Built.** Gates priced MCP tool calls and outbound A2A task sends. **It does not gate NEAR Agent Market purchases**: Ohwow has no NEAR buyer path at baseline. | `[STATED BY TEAM]` |
| 5 | Spend ledger and settlement records in the cloud | ohwow.fun `9a5a3bfd3` (settlements table, quoted price, approval audit), `0b1b6c7cf` (settlement decision, hold resolution), `4009ba7cb` (a settlement decision wherever an inbound task ends), `5f48061bb` (task contract, agent money and hold-resolve routes), `3d2808102` (per-agent money view: earned, pending, refunded, spent, editable caps, ledger), through `4a6bced43`. | Vercel production | **Built.** Records what an agent earned, held, refunded and spent, per task. | `[STATED BY TEAM]` |
| 6 | Inbound priced A2A execution (an outside agent sends Ohwow a task with a price) | ohwow.fun `src/lib/a2a/` (offers, approval, settlement); opt-in offers fail closed (JSON-RPC errors -32009 to -32012). Commits in the `9a5a3bfd3..4a6bced43` range, plus the offers work through `7f02b135d`. | Vercel production | **Built.** Offers are opt-in per agent and off by default. Uses Ohwow's own A2A method names, not the AgentProof adapter schema. | `[STATED BY TEAM]` |
| 7 | Wallet / custody of funds | None | None | **Does not exist.** Ohwow holds no NEAR or USDC keys. Market funds stay in the market account of the human who owns the agent. | `[STATED BY TEAM]` |

---

## 4. The line: pre-existing vs. November 1-14

**Background (rows 1-6): private, not submitted for judging.** Market client, sell backend, spend gate, ledger, inbound priced A2A.

**Judged Ohwow surface: a small public adapter in this repo.** It talks to Ohwow's NEAR market and spend-gate behaviour through a documented interface, the same model as the Peregrines executor seat (public interface, private internals). Its exact shape is decided with the team on Nov 1.

**To be built November 1-14 (hackathon work, in this repo or clearly marked):**

| Work | Task | Notes |
|---|---|---|
| NEAR **buyer** path: the requesting side creates and pays a hire through the market's draft-hire flow | TASK-004 | Ohwow has no buyer code today. |
| Spend gate applied to a NEAR market buy, with an over-limit request rejected before any market call | TASK-008 | Wires the existing gate (row 4) into the new buyer path. The gate exists; the NEAR wiring does not. |
| Evidence export: gate decision and ledger rows as `scenario-c-evidence.json` and the `agentproof-evidence-v1` fields | TASK-003, TASK-008 | The output format is public; gate internals stay private. |
| AgentProof external executor adapter for Ohwow (job_id, task_type, input, acceptance, policy in; deliverable, status, digest out) | TASK-013/014 (Ohwow as alternate executor) | Same contract HERO would implement; see Q7. |
| Live market API spec, verified | TASK-001 | `confirmed-api-spec.md` |

---

## 5. Answers to PRE-HACK-KICKOFF questions

**Q1. What precisely is deployed, where, and what can be demonstrated or reused under hackathon rules?**
Deployed to Vercel production at baseline `c5344e6cf`: the NEAR market client and sell backend (dormant, no live listing), the cloud ledger and settlement records, and inbound priced A2A. Shipped in the runtime at `ef950eb2`: the external spend gate. Demonstrable today: the gate and ledger on priced MCP and A2A calls, and the sell backend against fixtures. Demonstrable once P0 completes: a live Ohwow listing taking a paid market job. Reuse: as declared background infrastructure only. The live rules allow building on an existing project if the new work is separated (Q-003, Q-004) and own earlier libraries are listed as baseline (Q-005). Because the Ohwow code stays private, the judged Ohwow work is the public adapter in this repo.

**Q7. Can Ohwow implement the same external executor contract independently of HERO?**
Yes, as new hackathon work. Ohwow already accepts priced tasks from outside agents with an approval step and a per-task settlement record (rows 5-6). It does not yet speak the AgentProof request/response schema; that adapter is November work, and it would not depend on HERO.

---

## 6. Corrections to statements elsewhere in this repo

| Statement | Where | Correction |
|---|---|---|
| "Jesus's code may need migration" off the dead service-registry API | progress.md, 2026-10-31 notes | The client never used `/v1/services/{id}/invoke`. It targets the v2 agent/assignment API, refuses `market-legacy.near.ai`, and all 13 paths it calls exist in the live spec (row 1). |
| "Ohwow seller-side Agent Market integration already built/deployed" | NEAR-MARKET-RESEARCH.md section 6 | Built and present in production, but dormant: no live listing and no market call as of baseline. First live call in progress (row 3). |
| "Spend gate / ledger already built" | NEAR-MARKET-RESEARCH.md section 6 | Built. Covers priced MCP and A2A spend, not NEAR market buys (rows 4-5). |
| Job posting endpoint "`POST /v1/jobs` or equivalent" | NEAR-MARKET-RESEARCH.md section 8 | No `POST /v1/jobs` in the live spec. See `confirmed-api-spec.md`. |
| Old API "dead since September" | progress.md | True of the service-registry model. The `market-legacy.near.ai` host still answers HTTP 200, which is why the Ohwow client refuses it by name. |

---

*No secrets, workspace identifiers, account emails, prompts or customer data appear in this document. Paths, SHAs and behaviour only.*
