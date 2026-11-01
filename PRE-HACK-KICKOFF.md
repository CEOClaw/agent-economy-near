# Pre-Hack Kickoff — AgentProof / NEAR Agent Economy

> **October 30 planning snapshot, retained for provenance.** For the current November 1 public overview see [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [graph.md](graph.md). Contributor roles, optional executor capabilities and payment mechanics remain subject to verification. dPlaza is a non-owning integration platform, not an AgentProof equity participant.


**Planning baseline:** October 30, 2026  
**Hackathon window:** November 1–14, 2026  
**Status:** Proposed execution plan; not evidence of implemented features  
**Repository:** CEOClaw/agent-economy-near

> **AgentProof — Verified Work. Governed Execution. Portable Reputation.**

## Decision: one entry, two progressive engineering tracks

These are **internal engineering tracks**, not necessarily separate official hackathon submission categories. The agreed direction is **Option C (hybrid)**: use NEAR Agent Market rails where supported and retain dPlaza as the product/discovery layer. Do not build custom escrow or cross-chain settlement unless the actual interfaces demand it.

### Track 1 — Verified Agent Commerce (committed baseline)

**Goal:** Show an agent-to-agent economic transaction with objectively verified delivery, explicit spend controls, and portable identity/reputation evidence.

1. Patriot or another requester creates a narrow, objectively checkable task, surfaced through a dPlaza service listing where feasible.
2. A requester hires an agent through NEAR Agent Market using its *actual supported* account, funding and settlement flow.
3. Ohwow or another provider delivers; ideally it also subcontracts a follow-on task to CEOClaw.
4. An independent deterministic checker evaluates the agreed acceptance criteria. A correctly formatted answer is **not** automatically a factually correct answer.
5. A spend-limit gate blocks unauthorized downstream commitments and logs decisions.
6. The market's supported success/failure/payment/refund path is demonstrated; do not promise automatic refunds unless verified.
7. Associate agent identity and independently checkable work evidence with ERC-8004 on Base. Prefer a live feedback write/read if feasible; do not let the bridge block the NEAR demo.
8. Record a reproducible success, failed verification, and blocked-overspend scenario.

**Fallback by November 7:** If the second hire is not working, ship one completed market transaction plus verification failure and overspend-block demos. Avoid turning the fallback into a mock transaction.

**ERC-8004 scope:** Use standard identity/reputation interfaces, not a bespoke universal score. Record the job reference, evidence/checker reference, feedback author and chain context. A feedback entry alone does not prove the job was independently validated. The status of a legacy identity registration is unresolved and must not block delivery; plan on a fresh controlled CEOClaw identity. Details kept in team-private notes.

### Track 2 — External Agent Execution (optional extension)

**Goal:** Show that a marketplace agent can call an **independent external executor**, enforce an explicit task/policy envelope, and verify the returned work. This is **not a HERO-specific track**.

**Candidate executors:** Peregrines AI's **HERO**, **Ohwow**, CEOClaw, or another compatible agent. Choose based on working integration and permission, not brand.

**Minimal adapter contract**

- **Request:** job/task IDs; requester and target executor identity; capability/task parameters; objective acceptance criteria; authorized maximum spend; deadline; optional data/compute boundary policy; callback or polling reference.
- **Response:** job/task and executor IDs; status; deliverable or secure pointer; timestamps; failure reason; evidence/receipt and signer (if supported); relevant resource or policy metadata.
- **Verification:** independently check deliverable and available policy evidence; record pass/fail and evidence digest. A signed self-report proves who signed a claim, **not** that private inference or a network boundary was cryptographically enforced.
- **Demonstration:** successful authorized call, rejected policy-violating request or failed output, and optionally a reputation-informed second hiring decision.

**Peregrines AI option:** Guy Savage may contribute governed dispatch and in-boundary inference via HERO. Participation, external-call interface, and independently verifiable attestation capabilities are **unconfirmed**. Peregrines' implementation stays proprietary unless explicitly approved. A public adapter interface may be sufficient.

**Ohwow option:** Jesus to confirm external task endpoint/API/MCP, authentication, asynchronous execution, and result/evidence format. Use Ohwow as a valid alternative or first integration if faster.

**Non-goal:** Building a general orchestration platform, proving confidential inference without credible attestation, or adding a second marketplace.

## What we know vs. what we still must verify

- **Jesus's October 26 technical response (team-reported, not repository-verified):** proposed a two-hire demo; said Ohwow seller-side Agent Market integration and spend gate/ledger were already built/deployed in his own environment. He flagged mainnet USDC, account verification, and funding constraints. **Validate these claims against live NEAR Agent Market documentation/interfaces before implementing or funding.**
- **Current repository README (October 21) is historical:** its NEAR-native escrow, testnet-first and custom-contract assumptions are **not** the approved implementation plan. This kickoff document supersedes those assumptions for planning; existing README and architecture still need a coordinated update.
- **ERC-8004 reputation and AgentProof:** proposed architecture; no completed on-chain write or checker integration is claimed here.
- **Peregrines IP status (team-reported):** not independently verified; no runtime behavior or attestation has been verified. Details kept in team-private notes.

## Workstream ownership (proposed, not assigned)

| Workstream | Proposed participants |
| --- | --- |
| NEAR Agent Market, Ohwow execution, spending controls | Jesus |
| dPlaza service experience and product decisions | Sean / Main & Meta |
| Patriot requester, CEOClaw downstream executor | CEOClaw / Patriot |
| AgentProof checker, evidence schema and integration | Joint technical team; owner TBD |
| ERC-8004 identity/feedback on Base | Technical owner TBD |
| External execution / governed dispatch | Guy if he joins; Ohwow as alternate |
| Demo, documentation and submission | Joint team |

**Separation:** Main & Meta/dPlaza, CEOClaw/Patriot, and Peregrines remain distinct organizations/systems. Do not expose confidential client details.

## Execution gates

| When | Gate / deliverable |
| --- | --- |
| **Before Nov 1** | Confirm Jesus's report, market API/payment/account rules, allowed pre-existing work, owners, first deterministic task, and no-spend authorization policy. No hackathon-specific coding before start if event rules prohibit it. |
| **Nov 1–3** | Smallest genuine market transaction; agree task/evidence schema and independent checker interface. |
| **Nov 4–7** | Spend gate, checker, success/failure demos; decide whether second hire and external executor are viable. |
| **Nov 8–11** | Stable demo, ERC-8004 identity/feedback where feasible, dPlaza UI, optional external adapter. |
| **Nov 12–14** | Reproduce all scenarios, record video, confirm submission requirements, submit with human approval. |

## Decisions and questions to close

1. **Jesus:** What precisely is deployed, where, and what can be demonstrated or reused under hackathon rules?
2. **NEAR:** Confirm actual Agent Market funding asset/network, account verification, job API, escrow/refund mechanics, and minimum safe transaction.
3. **Checker:** Which deterministic task can be verified without trusting the executing agent's self-report?
4. **Spending:** Who controls the paying wallet, authorizes caps, and approves any real funds? **No transfers without explicit human sign-off.**
5. **ERC-8004:** Who owns implementation, what Base registry addresses/network will be used, and confirm the fresh controlled identity (legacy registration out of scope).
6. **Guy:** Will he join? Can HERO accept authenticated external jobs? What policy evidence can it return? What can be open-sourced safely?
7. **Ohwow:** Can it implement the same external executor contract independently of HERO?
8. **Scope:** Which official hackathon track(s) and public artifacts are permitted? Check official rules before publication or submission.

## Definition of done

**Baseline pass:** A real, reproducible agent-market transaction with independent acceptance check, auditable spend controls, and clear evidence; show both success and a blocked/failed path.

**Strong submission:** Add a genuine second agent hire, dPlaza listing, and ERC-8004 feedback linked to work evidence.

**Stretch:** Call a separate external agent via a reusable adapter and show an enforceable policy decision. HERO is one candidate, not a dependency.

---

*Planning note: This document records the proposed pre-hack kickoff, not confirmation that integrations, on-chain identity, or external execution are operational. Review with CEOClaw, Jesus, and Guy before treating proposed ownership or technical assumptions as commitments.*
