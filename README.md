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

**The idea.** Check the work against the brief before you pay. On NEAR Agent Market a buyer accepts a delivery and the money moves. AgentProof adds a step before that: it runs a separate checker on the delivery, writes a per-field checklist and a recommendation (accept, or send it back) to a NEAR testnet contract, and only then does the buyer decide, by hand, on market.near.ai. The checker is a helper, not a gate: no code here accepts, sends back, cancels or pays.

**Where it stands.** On the 2026-11-06 snapshot, the market reports 532 delivered jobs across 631 agents. AgentProof has checked 2 real jobs before the buyer paid, both hires placed by ohwow on 2026-11-11 (after the snapshot, so not among the 532) with sellers of a different owner: `8a20efe5` (Alex Pavliuk's `web-page-extractor`, check on chain [tx SjL5D7nm...](https://testnet.nearblocks.io/txns/SjL5D7nmgphzPrzrJFKF47nidjZmCYJyVxVfn5VUFGe), buyer accepted 158.9 s later) and `34d0f7a5` (Citrus Coast AI's `citrus-extract`: the first delivery was a refusal and was sent back, the redelivery passed, check on chain [tx 9EBhyxkb...](https://testnet.nearblocks.io/txns/9EBhyxkbRFKsmJFEM2mEM1Wox8drkogyUUf9VsZUjh9p), buyer accepted 614.7 s later). The contract is `agentproof-town.testnet` (deploy tx [4qXpVK9Q...](https://testnet.nearblocks.io/txns/4qXpVK9QKPJzPUkUQB6g9QhjPPJzFdegNd8QGaLTgJbi)).

**Tracks:** `agents`, `security`, `swarms`.

1. Do `cd town && node scripts/verify-decisions.mjs` (public RPC, no key). See `OK    8a20efe5 (runs/market-8a20efe5.json): on chain n=0, pass -> accept, block 277282896, ...` and `OK    34d0f7a5 (runs/market-34d0f7a5.json): on chain n=0, pass -> accept, block 277285351, ...`, each followed by `checked_before_paid: The check passed and was recorded on chain before the buyer paid.`
2. Do `python3 -m http.server 8787` in `town/`, open `http://127.0.0.1:8787/`, click **Proof view**. The switch reads `Market view 532` and `Proof view 2`; two buildings stay standing: web-page-extractor and citrus-extract.
3. Do `node scripts/gate.mjs fixture-wrong-delivery`. See `FAIL  CONTACT_EMAIL: field CONTACT_EMAIL: expected 'ops@ohwow.ai', got 'ops@WRONG-DOMAIN.com'` and `recommend        request_changes (the buyer decides on market.near.ai)`: a failing delivery recommends a send-back, never an accept.

Full judge path with expected output: [JUDGES.md](JUDGES.md). What it does not do yet: [Not](#not-what-the-town-does-not-do-yet).

> **November 1 project overview.** This repository contains both pre-event planning and hackathon development. A proposed architecture is not a completed integration. Actual results must be supported by code, tests, marketplace records or on-chain transaction references. The Command Center separates Workspace A (research and background technology) from Workspace B (new build and evidence).

## For judges: AgentProof Market Town (`town/`)

**What it is.** A browser page that draws every agent listed on NEAR Agent Market (market.near.ai) as a building whose height is the delivered-job count the market reports. Its **Proof view** keeps only jobs checked before the buyer paid: a passing check for that exact delivery was on NEAR testnet before the buyer accepted, the checker re-run in your browser agrees, the market shows the buyer accepted, and buyer and seller have different owners. Static HTML and Node scripts, no build step, no dependencies to install.

**The check.** `town/scripts/gate.mjs` runs the checker (`town/src/checker.js`, a line-for-line port of `task-002/checker.py`) on a delivery and prints one line per brief field and a recommendation. `--execute` records the checklist and recommendation on the contract (`town/contract/`, Rust) and reads it back; it never touches the market. `--confirm <job>` reads, read-only, what the buyer then did. The contract refuses to record an accept unless the verdict is pass. The market itself does not read the contract.

### Reproduce it locally

Needs Node 18 or newer and Python 3 (only for the static file server). Run every command from `town/`.

1. Do `node scripts/gate.mjs 34d0f7a5`. See a dry run (`DRY RUN: nothing is sent, signed or changed`): `ok` on all eight brief fields and `ok    no extra fields`, `verdict          PASS`, `recommend        accept (the buyer decides on market.near.ai)` and `market shows     job completed, hire accepted, accepted at 2026-11-12T00:04:46.010398Z`.
2. Do `node scripts/verify-decisions.mjs` (public RPC). See both recorded checks read back from the chain, with the order that counts: `(block 2026-11-11T23:30:02.755Z, accepted 2026-11-11T23:32:41.618120Z, 158.9 s later)` and `(block 2026-11-11T23:54:31.298Z, accepted 2026-11-12T00:04:46.010398Z, 614.7 s later)`.
3. Do `node scripts/verify-runs.mjs`. See one `OK` line per shipped record, then the portfolio lines: `web-page-extractor` and `citrus-extract` each `proof checked_before_paid 1, proven_receipts 1, distinct_owners 1`, and `ohwow-agent` `proof checked_before_paid 0, proven_receipts 1` (its CEOClaw job `2d17e4c8` re-checks between two owners but was paid on 2026-11-04, before any check). The `market:` line says `live` when market.near.ai answers and `snapshot from <time>` when it does not; the market numbers move with the live market, the check numbers do not.
4. Do `node scripts/check-analysis.mjs`. See it end with `OK    proven_total (2d17e4c8, 8a20efe5, 34d0f7a5): 3` and `OK    checked_total (8a20efe5 and 34d0f7a5 checked before paid; 2d17e4c8 was paid before any check): 2` and exit 0. These are the Data panel's numbers, recomputed from `data/market-snapshot.json` and the checks read from NEAR testnet.
5. Do `for t in scripts/test-*.mjs; do node $t || break; done`. The checker, check rule, contract client, signer and market-client tests, all offline (this is what CI runs).
6. Do `python3 -m http.server 8787` (same as `npm run dev`) and open `http://127.0.0.1:8787/`. Under the header: `Check the work against the brief before you pay. On the 2026-11-06 snapshot, the market reports 532 delivered jobs across 631 agents. AgentProof has checked 2 real jobs before the buyer paid.` Click **Proof view**, then the citrus-extract building: its card lists `34d0f7a5` with `verdict: pass`, `recommended: accept`, `buyer: accepted on Nov 12, after the check was on chain` and `check: on NEAR testnet, read live` linked to its transaction. Open `http://127.0.0.1:8787/?attack=forge` for the smaller check: an edited copy of receipt `2d17e4c8` is refused in red with `It was edited, so nothing was added.`
7. Open `http://127.0.0.1:8787/portfolio.html#citrus-extract`. See the shareable card with `1` checked before paid next to the market's numbers. Change the hash to any market handle (for example `#web-research`) and see 0 plus what it would take to get a job checked before paid.
8. Check Packs (acceptance standards with typed criteria and a judge panel): do `node scripts/test-packs-unit.mjs` (see `28 passed, 0 failed`) and `node scripts/test-packs.mjs` (see `all 6 tests passed`, with `hand agreement: 3 of 4` printed under test 1). Both run offline from stored judge runs in `data/backtest/`; every receipt there is labelled mock and is not market evidence. Open `http://127.0.0.1:8787/?packs=1` to see the receipts in the page. The format is in `town/docs/check-pack-spec.md`.

Stop the server with Ctrl-C when done. `town/README.md` has the full feature list and file map.

### NEAR integration

- **Check contract on NEAR testnet.** `agentproof-town.testnet` (deploy tx [4qXpVK9Q...](https://testnet.nearblocks.io/txns/4qXpVK9QKPJzPUkUQB6g9QhjPPJzFdegNd8QGaLTgJbi), code sha256 `dfb716e7...` = `town/contract/agentproof_anchor.wasm`). `record_decision` stores, per delivery, its digest, the checker version, the verdict and the recommendation and refuses a pairing the verdict does not allow. Two checks are recorded (tx [SjL5D7nm...](https://testnet.nearblocks.io/txns/SjL5D7nmgphzPrzrJFKF47nidjZmCYJyVxVfn5VUFGe) and tx [9EBhyxkb...](https://testnet.nearblocks.io/txns/9EBhyxkbRFKsmJFEM2mEM1Wox8drkogyUUf9VsZUjh9p)); the browser reads them live over public RPC (`town/src/decisions.js`). The same account holds the evidence anchor of receipt `2d17e4c8` ([tx 4BgoH9Vg...](https://testnet.nearblocks.io/txns/4BgoH9VgdpALFpsBi3fG4svybiiPP4APZCTw6hH6S5pa)), which `scripts/verify-anchors.mjs` re-checks.
- **NEAR Agent Market (market.near.ai), read only.** `src/market.js` reads the public agent list (`/v1` REST, paged in parallel) and `scripts/relay.mjs` is a local read-only relay for the browser (CORS). The snapshot in `data/market-snapshot.json` was taken with `scripts/market-snapshot.mjs`. The buyer's side of a hire is read with the buyer's login on the market's MCP server (`scripts/market-mcp.mjs`, read calls only).
- **Real market jobs as evidence.** `data/runs/market-8a20efe5.json` and `data/runs/market-34d0f7a5.json` are the two jobs checked before paid (ohwow as buyer, 0.50 USDC each). `data/runs/market-2d17e4c8.json` is a completed job (CEOClaw hired ohwow-agent, 1 USDC budget, checker pass, digest reproduced in the browser), paid before any check. `data/runs/market-b68f5497.json` is a $1 market job with a 0.95 USDC payout seen in the seller's market wallet; buyer and seller share an owner, so it earns no reputation.
- **NEARO testnet demo (`nearo-demo/`).** The team agent NEARO signs and sends its own NEAR testnet transaction with near-cli and refuses mainnet: https://testnet.nearblocks.io/txns/9jgzWgRJvrg1S6SPka1AQDRd5kuAi7dNrW9EU6zYf4FU. Setup, dry run, live send and tests are in [nearo-demo/README.md](nearo-demo/README.md). The Rust file `nearo-demo/contracts/testnet_demo.rs` is not deployed.
- **What the town does not do.** No market write call: it never accepts, sends back, cancels or pays. No wallet in the page. The town does not verify on-chain settlement: payouts are shown as recorded, and the one recorded NEAR Intents (1Click) deposit is shown as recorded, its transaction kept private.

### Not: what the town does not do yet

- The market does not consult the contract, and the buyer decides. A buyer can accept by hand with no check, or let the 3-day window auto-accept. Such jobs never count as checked before paid.
- 2 jobs are checked before paid, both bought by ohwow (one buyer, two sellers). That is a sample, not a track record.
- A failed check does not block or refund a payment. It recommends a send-back; the buyer decides.
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
