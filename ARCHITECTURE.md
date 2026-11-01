# AgentProof — Working Architecture

**Updated: November 1, 2026** · **Status: Option C hybrid is the working design; open to review by all three human collaborators.**  
[Main README](README.md) · [Team alignment](TEAM-ALIGNMENT-2026-10-31.md) · [Checker specification](AGENTPROOF-CHECKER.md) · [Graph](graph.md)

## Architectural decision

**Option C: Rent the rails, own the trust.** Use supported NEAR Agent Market discovery/job/payment infrastructure rather than duplicating it. Build a small, evidence-centered integration that can serve dPlaza as an optional product/UX surface, Ohwow and CEOClaw as independent work providers, and Peregrines as an optional separately governed external executor.

This is not a claim that the complete integration is working. Prefer one genuine paid job over a larger simulated network.

## Four layers and interface boundaries

| Layer | Systems | Contract between layers |
|---|---|---|
| Commerce | NEAR Agent Market; optional dPlaza listing | Immutable task, budgets, job identifiers, actual payment status, provider binding |
| Execution | Requester Patriot; Ohwow/CEOClaw; optional Peregrines HERO/Nero | Authenticated task request, output, job status, output digest, narrowly scoped execution-policy record |
| Trust | AgentProof checker, spend gate, evidence writer | Precommitted acceptance tests, actual output comparison, policy authorization decision, canonical receipt |
| Portable identity | ERC-8004 Identity / Reputation (and evaluate Validation interface) on Base | Link registered agent to actual evidence/feedback, preserving verifier identity and provenance |

**Peregrines is an optional peer executor, not a mandatory sequential hop in every job.** HERO/Nero roles and public evidence should be confirmed with Guy. Do not publish proprietary governance internals.

## Preferred demonstration

1. Patriot or another authorized requester defines a synthetic structured-field-extraction job and a spending ceiling.
2. Hire through verified NEAR Agent Market account and payment mechanism, with human-approved expenditure; capture actual market job reference.
3. An agent delivers output; AgentProof checks exact fields against the original committed fixture using a deterministic checker.
4. Emit verifiable job/evidence receipts with job reference, checker version, input/output digests, test outcome and signer/provenance when supported.
5. Demonstrate wrong-output rejection and pre-commitment overspend blocking. Distinguish logical spend-gate tests from proof of monetary enforcement.
6. Optionally add second agent hire, dPlaza listing, Peregrines allowed/rejected job, and ERC-8004 evidence-linked feedback.

**The checker does not control escrow by definition.** Only claim automatic release, refund or dispute actions when backed by the marketplace's actual API/transaction results.

## The differentiation we are testing

AgentProof aims to make **authorization + outcome correctness + independently inspectable provenance** portable across different agent operators and marketplaces. NEAR provides commerce rails; ERC-8004 provides identity/reputation/validation interfaces; AgentProof is the proposed connector and evidence discipline. This is a hypothesis to demonstrate, not a claim of exclusive invention.

- A job-specific deterministic test checks a narrow, objectively knowable output.
- A spending rule enforced before financial commitment can show an actionable deny decision.
- A governance record can attest what an external executor reported; do not overclaim local-only security without separately verifiable assurance.
- Registration and feedback alone do not prove quality or legal identity.

## dPlaza position

dPlaza is an **existing non-owning integration platform** and potential commercial beneficiary, not an equity/ownership participant in AgentProof by virtue of use. Its existing commerce/NFT stack is separate from ERC-8004 agent identity NFT registration, which must use the standard registry interface. A self-service agent identity/service marketplace is a follow-on [product opportunity](DPLAZA-ERC8004-INTEGRATION.md), not the primary hackathon dependency.

## Implementation priority and fallback

| Priority | New work | Gate |
|---|---|---|
| P0 | Market mechanics confirmed, one real funded hire, deterministic checker, reproducible evidence and spend policy demo | Build toward Nov 7 |
| P1 | Wrong-output case, optional second hire; dPlaza demo listing | After P0 stable |
| P1/P2 | Optional Peregrines adapter and limited public boundary evidence | Agree interface/IP with Guy |
| P2 | ERC-8004 Base identity/feedback and dPlaza native identity UX | Only if approved and P0 stable |

**Funding, minting and production deployments require explicit human authorization.** Contract addresses, endpoint availability, transaction assets and wallet custody must be verified from official sources before use. No secrets or confidential client materials in the public repo.

## Historical alternatives (October 21)

- **A — Independent marketplace:** Build dPlaza's own NEAR escrow/reputation rails. Higher effort and duplication risk; not current MVP.
- **B — Integrated storefront:** dPlaza fronts NEAR Agent Market without distinct trust services. Fast, but less differentiated.
- **C — Hybrid (current):** NEAR Agent Market rails + optional dPlaza experience + independent AgentProof verification/spend/evidence integrations.

The October 21 architecture evaluation and previous 'testnet-first/custom escrow/NEAR-token payments' statements were planning hypotheses. They are not current implementation requirements. See the repository's Git history and [BRAINSTORM.md](BRAINSTORM.md) for original research.

## Decisions still awaiting verification

- Official code-eligibility and final submission rules, including any restrictions on pre-existing components.
- NEAR Agent Market API, verified accounts, payment assets, on-chain settlement, refund/dispute behavior and minimum amounts.
- Compatible Ohwow interfaces and existing spend-control gate.
- Peregrines interface and achievable independent evidence for security boundaries.
- Base ERC-8004 contract deployments/ABIs, controlled identity wallet, allowable feedback and evidence format.
- Public license, external IP boundaries, and ownership of original integration work.

Task state belongs in [graph.md](graph.md), [checks.md](checks.md) and [progress.md](progress.md), with code and GitHub PR evidence rather than unsupported project claims.
