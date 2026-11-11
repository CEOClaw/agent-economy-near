# AgentProof

**Verified Work. Governed Execution. Portable Reputation.**  
*Rent the rails, own the trust.*

**NEAR AI Hackathon | November 1–14, 2026 | Agent Economy (proposed primary track)**

[Command Center](https://ceoclaw.ai/nearteam/) · [Execution graph](graph.md) · [Acceptance checks](checks.md) · [Progress](progress.md) · [Architecture](ARCHITECTURE.md) · [Hackathon requirements](HACKATHON.md)

**Community:** [Discord](https://discord.gg/Gpq7x5pMV) · **AgentProof Voice:** +1 (279) 236-6129

[![town tests](https://github.com/CEOClaw/agent-economy-near/actions/workflows/town-tests.yml/badge.svg)](.github/workflows/town-tests.yml)

Patent pending: a US provisional application covering this work has been filed. The MIT license covers only the code described in LICENSE; Check Packs are excluded and all rights in them are reserved.

## Start here (no account, no key, no install)

**Hosted (live after Nov 11):** https://ceoclaw.github.io/agent-economy-near/town/ (GitHub Pages, static, same files as `town/`). Until then, and always, the local steps below.

**Problem.** NEAR Agent Market counts what agents say they delivered; nothing tells a buyer which jobs met the brief between two different owners. On the 2026-11-06 snapshot: 631 agents, 532 delivered jobs, 1 backed by a receipt your browser can re-check.

**Tracks:** `agents`, `security`, `swarms`.

1. Do `cd town && node scripts/verify-runs.mjs`. See `OK    market-2d17e4c8.json: pass, digest 89c9b813f4a2 = stored` and `proof verified_jobs 1, distinct_owners 1` for ohwow-agent.
2. Do `python3 -m http.server 8787` in `town/`, open `http://127.0.0.1:8787/`, click **Proof view**. See the counter go from `532 delivered (market's word)` to `1 proven`, with one building left standing: ohwow-agent.
3. Click **Try a forged receipt**. See it refused in red: `This copy of receipt 2d17e4c8 does not match the one on the map (...). It was edited, so nothing was added.`

Full judge path with expected output: [JUDGES.md](JUDGES.md). What it does not do yet: [Not](#not-what-the-town-does-not-do-yet).

> **November 1 project overview.** This repository contains both pre-event planning and hackathon development. A proposed architecture is not a completed integration. Actual results must be supported by code, tests, marketplace records or on-chain transaction references. The Command Center separates Workspace A (research and background technology) from Workspace B (new build and evidence).

## For judges: AgentProof Market Town (`town/`)

**What it is.** A browser page that draws every agent listed on NEAR Agent Market (market.near.ai) as a building whose height is the delivered-job count the market reports. Its **Proof view** keeps only jobs backed by a receipt that your browser re-checks: the checker re-runs on the delivered output and the evidence digest must reproduce. Static HTML and Node scripts, no build step, no dependencies to install.

**The problem.** The market's counters say what an agent delivered, not whether the delivery met the brief or whether buyer and seller are the same owner. On the 2026-11-06 snapshot the market reports 532 delivered jobs across 631 agents (511 with none), and exactly 1 job is backed by a re-checkable receipt between two different owners (CEOClaw hired ohwow-agent, job `2d17e4c8`).

### Reproduce it locally

Needs Node 18 or newer and Python 3 (only for the static file server). Run every command from `town/`.

1. Do `cd town && node scripts/verify-runs.mjs`. See five `OK` lines, one per shipped record, then the portfolio lines:
   ```
   OK    market-2d17e4c8.json: pass, digest 89c9b813f4a2 = stored
   OK    market-b68f5497.json: pass, digest bede85c360ca = stored
   OK    fixture-wrong-delivery.json: fail (field CONTACT_EMAIL: expected 'ops@ohwow.ai', got 'ops@WRONG-DOMAIN.com')
   OK    checker-blocked-budget.json: blocked (spend_gate: executor requested 1.00 USDC; envelope max_spend_usdc is 0.25 USDC), equals committed result
   OK    policy-scenario-c.json: policy record, rejected ($50 vs cap $10); not re-executable here, shown as recorded
   PORTFOLIO ohwow-agent: market delivered N ... proof verified_jobs 1, distinct_owners 1, ... self_hires 1, ...
   ```
   The `market:` line says `live` when market.near.ai answers and `snapshot from <time>` when it does not; the market numbers move with the live market, the proof numbers do not.
2. Do `node scripts/check-analysis.mjs`. See it end with `OK    n: 631`, `OK    delivered_total: 532`, `OK    zero.count: 511`, `OK    available.count: 341`, `OK    proven_total: 1` and exit 0. These are the Data panel's headline numbers, recomputed from `data/market-snapshot.json`.
3. Do `node scripts/test-market.mjs`. See `all 12 passed` (market client and local relay, fake fetch, no network).
4. Do `python3 -m http.server 8787` (same as `npm run dev`) and open `http://127.0.0.1:8787/`. See the town drawn from the snapshot, labelled "snapshot from ...". Flip the header switch to **Proof view**: one building stays standing with a gold seal, ohwow-agent. Click it: its card says proven 1, plus 1 self-hire at 0 points, the same numbers step 1 printed, computed by the same `src/checker.js` and `src/portfolio.js`.
   Then click **Try a forged receipt** (or open `http://127.0.0.1:8787/?attack=forge`): the page edits one field of receipt 2d17e4c8 (budget 1 to 100 USDC), offers the copy and refuses it in red with `It was edited, so nothing was added.`; the counter does not move.
5. Open `http://127.0.0.1:8787/portfolio.html#ohwow-agent`. See the shareable card with 1 proof-backed job next to the market's numbers. Change the hash to any market handle (for example `#web-research`) and see 0 proof plus what it would take to earn one.
6. Optional, live data: do `node scripts/relay.mjs` in a second terminal. The open page finds the relay on 127.0.0.1:8788 and the header switches to "live via relay" once real data arrives. Without the relay the browser console shows refused-connection lines from the probe; they are expected.
7. Check Packs (acceptance standards with typed criteria and a judge panel): do `node scripts/test-packs-unit.mjs` (see `28 passed, 0 failed`) and `node scripts/test-packs.mjs` (see `all 6 tests passed`, with `hand agreement: 3 of 4` printed under test 1). Both run offline from stored judge runs in `data/backtest/`; every receipt there is labelled mock and is not market evidence. Open `http://127.0.0.1:8787/?packs=1` to see the receipts in the page. The format is in `town/docs/check-pack-spec.md`.

Stop the server with Ctrl-C when done. `town/README.md` has the full feature list and file map.

### NEAR integration

- **NEAR Agent Market (market.near.ai), read only.** `src/market.js` reads the public agent list (`/v1` REST, paged in parallel) and `scripts/relay.mjs` is a local read-only relay for the browser (CORS). The snapshot in `data/market-snapshot.json` was taken with `scripts/market-snapshot.mjs`.
- **Real market jobs as evidence.** `data/runs/market-2d17e4c8.json` is a completed market.near.ai job (CEOClaw hired ohwow-agent, 1 USDC budget, checker pass, digest reproduced in the browser). `data/runs/market-b68f5497.json` is a $1 market job with a 0.95 USDC payout seen in the seller's market wallet; buyer and seller share an owner, so it earns no reputation. `scripts/export-ohwow-market-job.sh` exports a market job as a run bundle with account ids stripped.
- **NEARO testnet demo (`nearo-demo/`).** The team agent NEARO signs and sends its own NEAR testnet transaction with near-cli and refuses mainnet: https://testnet.nearblocks.io/txns/9jgzWgRJvrg1S6SPka1AQDRd5kuAi7dNrW9EU6zYf4FU. Setup, dry run, live send and tests are in [nearo-demo/README.md](nearo-demo/README.md). The Rust file `nearo-demo/contracts/testnet_demo.rs` is not deployed. This is the one on-chain piece of the entry and it is part of the hackathon diff.
- **What the town does not do.** No NEAR smart contract, no transaction signing, no wallet. The town does not verify on-chain settlement: the one recorded NEAR Intents (1Click) deposit is shown as recorded, its transaction kept private.

### Not: what the town does not do yet

- NEAR integration is read-side only: the town reads NEAR Agent Market (market.near.ai) and re-checks receipts in the browser. The town has no NEAR smart contract and sends no transaction; digests are not anchored on NEAR. No NEAR contract is deployed anywhere in this entry (the Rust file in `nearo-demo/` is not deployed); NEARO's testnet transfer is the one on-chain piece.
- A failed check does not block or refund a payment. The verdict changes what the town shows, not where money goes.
- The hosted copy goes live after Nov 11; until then every step runs on 127.0.0.1. Hosted, the town draws from the stored snapshot: the live relay is local only.
- Check Packs results are a mock backtest (23 receipts, all `mock: true`), not market evidence. Hand agreement is 3 of 4: site v3 reads `contested` (judges 3/5/4 on brief fit) where the hand review said pass; the threshold was not tuned to change that.
- On-chain settlement is not verified: payouts are shown as recorded by the market or the seller's wallet.

### Libraries and baseline (Q-005)

- three.js 0.160.0, vendored in `town/vendor/three` (MIT). Google Fonts load from the network and fall back. Everything else is Node built-ins and plain browser APIs.
- Check Packs judge runs were made once with `scripts/pack-judge.mjs` through OpenRouter (google/gemini-3.1-flash-lite, openai/gpt-5-mini, deepseek/deepseek-v4.1-flash) and stored; nothing in the steps above calls a model or needs a key.
- Pre-existing platforms the records come from, not part of this repository and not claimed as window work: ohwow (the executor agent and its production records), CEOClaw (the buyer and its site builder), NEAR Agent Market itself.

### Build window and how the diff separates (Q-001, Q-002, Q-003)

- The window runs from the announcement on 2026-10-19. This repository's first commit is 2026-10-21 (`26d2a2f`), so there is no pre-window code in its history. The town's history starts 2026-11-03 (`f534b9f`); its 60 commits keep their original SHAs and dates and were merged under `town/` as one merge commit (see `git log --first-parent` on this branch).
- Tag `pre-hackathon` marks `26d2a2f`, the initial scaffold (one README, no code). Tag `hackathon-submission` marks the submitted state. `git diff --stat pre-hackathon hackathon-submission` is the judged work; `git diff --stat pre-hackathon hackathon-submission -- town/` is the town alone. On GitHub: `compare/pre-hackathon...hackathon-submission`.
- The product the town reads from (NEAR Agent Market) and the agents in the records (ohwow, CEOClaw) existed before the window and are not judged here; only the code in this repository is.

## What AgentProof is

AgentProof is a proposed interoperability and evidence layer for agent-to-agent work. Its goal is to let an independent buyer or agent check **what was authorized, what was delivered, whether it passed agreed acceptance tests, and what evidence another system can inspect**. It is *not* another blockchain, a replacement for NEAR Agent Market, or proof that an agent is trustworthy merely because it has an identity NFT.

**The demonstration we are building:** a requester such as Patriot initiates a narrowly defined job using supported NEAR Agent Market rails. An independent executor, such as Ohwow or CEOClaw, delivers a result. A deterministic checker evaluates the actual output against precommitted criteria. The workflow records authorization, job and output references, pass/fail results, and a blocked-overspend scenario. Optional extensions include downstream paid delegation, Peregrines governed execution, dPlaza service discovery, and ERC-8004 identity/feedback on Base.

## Four functional layers

| Layer | Component | Responsibility | Status |
|---|---|---|---|
| 1. Discovery and commerce | NEAR Agent Market; dPlaza integration surface | Real job marketplace and supported payment/settlement; optional dPlaza agent-service listing | Existing third-party platforms; new adapter/listing proposed |
| 2. Independent execution | Patriot, Ohwow, CEOClaw, optional Peregrines HERO/Nero | Request, deliver, possibly subcontract bounded work | Agents exist or are team-reported; specific hackathon flows not yet verified here |
| 3. AgentProof trust services | Deterministic checker, spend authorization, evidence receipts | Evaluate correctness, distinguish policy decisions from output validation, create reproducible receipts | Defined in specifications; implementation evidence tracked separately |
| 4. Portable identity | ERC-8004 registries on Base | Identify agents and link appropriately authorized reputation/validation evidence | Existing standard; specific AgentProof integration proposed |

**Trust boundaries:** A signed executor statement or hash does not alone prove local-only execution or task correctness. A deterministic checker can prove the specified synthetic result matches its committed reference, not general truth. ERC-8004 registration or feedback is not a substitute for such evaluation.

## The team

Three human collaborators in the joint hackathon effort:

- **Sean P. Larkin** — project coordination, CEOClaw and integration strategy.
- **Dr. Guy Savage** — Peregrines AI; proposed external governed-executor integration and policy evidence.
- **Jesús David Oñoro Delgado** — Ohwow and proposed agent-commerce/dPlaza integration work.

Supporting agents: **CEOClaw** (operations and engineering), **Chief** (separate Grok-based strategy agent), **Patriot** (research and requesting-agent candidate), and **Chat** (documentation and architecture support). Roles are working assignments and remain subject to contributor review.

**Ownership boundary:** dPlaza is an existing, non-owning integration/product platform for this collaboration; participation does not give dPlaza or Main & Meta an AgentProof ownership interest. Existing platform IP remains with its respective owner. Prize-sharing and any later commercialization are separate from this technical README and are handled privately.

## What judges should be able to do

**Primary success criterion (planned, not claimed complete):**
1. Open an actual job reference from the supported marketplace and see the authorized amount and task specification.
2. Retrieve a deliverable and run the published checker against committed synthetic ground truth.
3. Inspect a pass, a deliberate wrong-output failure, and a blocked authorization attempt with clear reason and evidence.
4. Reproduce the result from documented inputs, versioned checker code, and receipts.

**Optional, only if implemented:** See a real second agent hire, inspect a Peregrines authorized/rejected policy decision with accurately described evidence assurance, view a dPlaza service listing, and verify an ERC-8004 Base transaction referring to job evidence.

Do not treat mock jobs as paid hires, format validation as correctness, a feedback transaction as truth, or a failed checker as automatic escrow refund. Exact NEAR Market account/payment mechanics require confirmation and authorized funding.

## Build window and status

- **October 21–31:** background research, planning, architecture, source inventory, project graph, Command Center preparation. Preserve as provenance; do not pass off existing platform code as newly developed.
- **November 1–3 (target):** confirm rules and market/API requirements; implement initial checker, evidence schema and integration harness.
- **November 4–7 (target):** genuine authorized market transaction, independent verification, and spend-limit evidence. **November 7 is a scope gate.**
- **November 8–11 (conditional):** dPlaza listing, Peregrines adapter, downstream hire, ERC-8004 feedback as feasible.
- **November 12–14:** independent replay, security review, demo, submission documentation and human-approved submission.

Dates above are **plans**, not completed milestones. Check [progress.md](progress.md), GitHub issues/PRs and evidence links for the latest recorded state. Actual work should have timestamps, contributors, commits, acceptance tests and reproducible artifacts.

## Repo navigation

| Document | Purpose |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Current Option C architecture and trust boundaries |
| [TEAM-ALIGNMENT-2026-10-31.md](TEAM-ALIGNMENT-2026-10-31.md) | Working collaboration proposal, drafted before build |
| [AGENTPROOF-CHECKER.md](AGENTPROOF-CHECKER.md) | Deterministic acceptance and evidence specification |
| [graph.md](graph.md), [checks.md](checks.md), [progress.md](progress.md) | Task DAG, gates and progress snapshots |
| [NEAR-MARKET-RESEARCH.md](NEAR-MARKET-RESEARCH.md) | October 30 research; confirm against current API |
| [DPLAZA-LISTING-SPEC.md](DPLAZA-LISTING-SPEC.md) | Proposed service demo listing |
| [DPLAZA-ERC8004-INTEGRATION.md](DPLAZA-ERC8004-INTEGRATION.md) | Longer-term dPlaza agent-service and identity product vision |
| [ERC8004-IDENTITY-PLAN.md](ERC8004-IDENTITY-PLAN.md) | Proposed Base identity; do not assume mint or custody |
| [PRE-HACK-KICKOFF.md](PRE-HACK-KICKOFF.md) | October 30 planning baseline |
| [BRAINSTORM.md](BRAINSTORM.md) | Historical October 21 options and questions |
| [HACKATHON.md](HACKATHON.md) | Captured contest requirements; reverify official site before submission |
| [JUDGES.md](JUDGES.md) | Five-minute judge path for the town: do X, see Y |
| [town/README.md](town/README.md) | AgentProof Market Town: market agents vs proof-backed jobs, re-checked in the browser; Check Packs |

## Governance and submission

- GitHub is authoritative for code and review. Command Center provides navigation and project visibility.
- No production credentials, wallet secrets, confidential partner material or private customer data in this public repo.
- Publishing, mainnet spending, wallet minting, risky merges, production changes, and final submission require explicit human authorization.
- Contributors maintain their underlying IP. Public submission licensing and use of third-party background code require contributor approval.
- Official rules and submission requirements: [nearhackathon.com](https://nearhackathon.com/). A public repo is not evidence of eligibility by itself; identify which work is qualifying and which existed before the event.
- **Do not submit early:** the application is treated as a one-shot submission in our captured rules; confirm the latest instructions.

*This README is the public landing page as of November 1, 2026. Earlier concepts remain traceable in Git history and dated planning notes, not as current implementation claims.*
