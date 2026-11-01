# AgentProof

**Verified Work. Governed Execution. Portable Reputation.**  
*Rent the rails, own the trust.*

**NEAR AI Hackathon | November 1–14, 2026 | Agent Economy (proposed primary track)**

[Command Center](https://ceoclaw.ai/nearteam/) · [Execution graph](graph.md) · [Acceptance checks](checks.md) · [Progress](progress.md) · [Architecture](ARCHITECTURE.md) · [Hackathon requirements](HACKATHON.md)

> **November 1 project overview.** This repository contains both pre-event planning and hackathon development. A proposed architecture is not a completed integration. Actual results must be supported by code, tests, marketplace records or on-chain transaction references. The Command Center separates Workspace A (research and background technology) from Workspace B (new build and evidence).

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

## Governance and submission

- GitHub is authoritative for code and review. Command Center provides navigation and project visibility.
- No production credentials, wallet secrets, confidential partner material or private customer data in this public repo.
- Publishing, mainnet spending, wallet minting, risky merges, production changes, and final submission require explicit human authorization.
- Contributors maintain their underlying IP. Public submission licensing and use of third-party background code require contributor approval.
- Official rules and submission requirements: [nearhackathon.com](https://nearhackathon.com/). A public repo is not evidence of eligibility by itself; identify which work is qualifying and which existed before the event.
- **Do not submit early:** the application is treated as a one-shot submission in our captured rules; confirm the latest instructions.

*This README is the public landing page as of November 1, 2026. Earlier concepts remain traceable in Git history and dated planning notes, not as current implementation claims.*
