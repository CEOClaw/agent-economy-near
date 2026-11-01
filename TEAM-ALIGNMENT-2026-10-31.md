# AgentProof — Joint Team Alignment (October 31, 2026)

> **October 31 team proposal, retained for provenance.** Read [README.md](README.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for the November 1 project framing. Jesus and Guy have repository write access (verified November 1); earlier invitation questions below are historical. The three human collaborators are Sean P. Larkin, Dr. Guy Savage, and Jesús David Oñoro Delgado. CEOClaw is the separate operational agent and Command Center builder; Chief is the separate Grok-based strategy agent. dPlaza is a non-owning integration platform. No agreement or code deployment is implied by this update.


**Status:** Proposed joint plan for review, not an implementation claim. **Build window:** November 1–14, 2026, subject to official rules. **Option C:** dPlaza discovery + NEAR Agent Market rails + AgentProof verification and spending evidence.

## Goal
Demonstrate an authentic agent-to-agent hire with objectively checked deliverables, pre-authorized spending, and reproducible evidence. Tagline: **Rent the rails, own the trust.** One coordinated submission is preferred, pending team and contest confirmation.

## Proposed roles
- Sean: coordination, dPlaza product direction, final scope, payments and submission approval.
- Jesus / Ohwow: claimed existing seller-side market integration and spend ledger; proposed buyer, delegation and NEAR integration. Existing code must be inventoried and verified.
- CEOClaw / Chief and Patriot: requesting and downstream agent flows; repo/test coordination.
- Guy / Peregrines AI: accepted in principle on October 31; independent governed executor seat, documented API, policy rejection and evidence, proprietary internals retained.
- Independent checker and evidence schema: shared engineering; owner to be assigned.

## Main demo and fallback
1. Patriot requests a narrow, deterministic task, with immutable input, acceptance tests and explicit spend cap.
2. An authentic paid NEAR Agent Market job follows the market's verified authentication, settlement, and escrow rules. Do not assume NEAR token, testnet, refunds or free marketplace payments.
3. Ohwow executes; optionally subcontracts a distinct job to CEOClaw after a spend pre-check.
4. An independent checker validates structured-field extraction against precommitted synthetic ground truth; separate pass, fail and blocked states.
5. dPlaza presents a service listing and relevant outcomes if feasible.
6. If working, ERC-8004 feedback on Base references the job/checker evidence. Reputation feedback is not proof by itself.

**November 7 fallback:** one real verified paid marketplace hire plus failed-output and blocked-overspend demonstrations. A simulated transaction cannot substitute for the paid hire.

## Optional external executor — Peregrines
Guy offers a dedicated nonproduction executor seat with no production credentials, local inference and lockdown. It accepts an authenticated job with job_id, task_type, input, acceptance, policy and evidence_requested, then returns deliverable, status, digest, and available boundary evidence. Demo one permitted extraction and one rejected policy-violating request. HERO holds no NEAR funds. Publish agreed interface and evidence schema; keep Peregrines dispatch and lockdown source private.

**Evidence caveat:** A deterministic checker can independently establish correctness of a synthetic extraction. Signed or hashed execution logs do not alone prove network isolation or local-only inference; distinguish observed checks, executor claims, and independently verifiable attestations.

## Timing and eligibility
- **Through October 31:** architecture, inventory pre-existing Ohwow/dPlaza/Peregrines capabilities, record baseline SHA and written plans, confirm ownership and rules. Do not count pre-existing code as November-created work.
- **November 1–3:** implement narrow task checker and market integration; demonstrate account/payment handshake.
- **November 4–7:** real transaction, verification, spend cap, failure tests; go/no-go second hire and Peregrines integration.
- **November 8–11:** stabilize dPlaza surface, external adapter if ready, optional Base ERC-8004 feedback.
- **November 12–14:** replayability, evidence, security, README, video/X demo and human-approved submission.

Official rules on previously developed software and hackathon-specific code must be verified; this plan does not claim that any specific pre-event work is eligible.

## Open decisions
1. Official submission track(s), entrant, roster, shared repo credit, license and allowed background IP.
2. NEAR Market payment asset/network, human adoption, escrow/refund, APIs and minimum transaction; explicit human approval for all fund transfers.
3. Live inventory of Ohwow, dPlaza and Peregrines components, with pre-event version references.
4. Checker owner, canonical request/response and digest serialization, reproducible permitted and rejected test cases.
5. What independently testable evidence Peregrines can provide about policy enforcement.
6. ERC-8004: a fresh CEOClaw mint is *proposed* in ERC8004-IDENTITY-PLAN.md, not completed; confirm controlled wallet and timing. Legacy registration: details kept in team-private notes.
7. Guy's GitHub username, Jesus's reported username jesusonoro, repo permissions, workstation access, and weekend sync time.

## Collaboration boundaries
Repo is the shared source of truth for proposed architecture, PR-reviewed code, test results and demo instructions. Any shared workstation should have separated credentials, no production or client material, no secrets in commits, and human-approved payments and releases. Keep company IP distinct and honor Peregrines confidential implementation.

## Current confidence
The October 30 repository documents are planning specifications, not proof of integration. Jesus's October 26 report of existing Ohwow capabilities is team-reported. Guy's October 31 email states his willingness and concrete proposal, not a completed interface. Re-check official event and market rules before implementation.

## dPlaza agent identity expansion (new planning document)
See [DPLAZA-ERC8004-INTEGRATION.md](DPLAZA-ERC8004-INTEGRATION.md) for the proposal: dPlaza could offer native ERC-8004 agent identity registration/import, agent services listings and evidence-linked reputation display. These identity NFTs are registered with the standard Identity Registry, not minted as ordinary merchandise inventory. **This is proposed product scope, not built functionality.** The hackathon priority remains a real NEAR market hire, independent checker and enforced spending policy; identity UI and Base feedback are secondary if time allows.

## Existing references
PRE-HACK-KICKOFF.md; AGENTPROOF-CHECKER.md; DPLAZA-LISTING-SPEC.md; NEAR-MARKET-RESEARCH.md; ERC8004-IDENTITY-PLAN.md; HACKATHON.md; DPLAZA-ERC8004-INTEGRATION.md.