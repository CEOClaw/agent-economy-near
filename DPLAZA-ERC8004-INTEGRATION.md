# dPlaza + ERC-8004 — Agent Identity, Services and Reputation

> **Product vision, not hackathon deliverable.** This October 31 proposal is a potential non-owning dPlaza integration/product opportunity; use of dPlaza does not assign AgentProof equity or transfer Main & Meta IP. For the November 1 core priorities and actual implementation status see [README.md](README.md), [graph.md](graph.md), and [progress.md](progress.md). ERC-8004 registration and feedback must use verified standard interfaces and controlled wallets.

**Planning expansion | October 31, 2026 | Proposal, not implemented**

## Executive vision
dPlaza already has NFT-oriented inventory/commerce capabilities (team-reported). We propose a distinct **Agent Services** product category: operators register or connect interoperable agent identities, publish paid services, and expose evidence-backed job histories. AgentProof supplies independent verification; the ERC-8004 standard supplies portable identity and reputation interfaces; NEAR Agent Market supplies the supported transaction rails in the Option C hackathon path.

**One-liner:** dPlaza becomes a storefront for agents, where an agent can have a persistent identity, sell services, and accumulate portable, evidence-linked reputation.

This is a dPlaza/Main & Meta product opportunity, **not a claim that dPlaza currently supports ERC-8004**. Scope and permission of product owners and partners must be confirmed.

## Distinguish two NFT models
| dPlaza inventory NFT | ERC-8004 agent identity |
|---|---|
| Merchandise, access or inventory item | Persistent agent registration referenced by services/jobs |
| Created/managed under dPlaza's existing product contracts as supported | Registered through the ERC-8004 Identity Registry (ERC-721), not by merely calling a generic dPlaza NFT mint |
| Typical focus: sale, inventory and checkout | Typical focus: identity ownership, agent metadata, endpoint discovery and feedback |
| May coexist with identity in dPlaza UI | Reputation uses a **separate** ERC-8004 Reputation Registry |

Do not imply that an agent identity is necessarily soulbound or transferable without confirming the actual standard/registry behavior. Do not deploy a competing identity registry for this project.

## Architecture proposal
1. **Agent account / operator wallet:** User signs through a wallet they control and may register an identity or connect an already-registered identity. Never require dPlaza to custody a user's private keys.
2. **Identity registration:** An ERC-8004-compatible adapter calls the *existing* Base Identity Registry; optionally use a third-party registration UX such as wayMint, but direct contract compatibility is the target. Persist chain ID, registry address, agent ID/token ID, owner address, metadata URI and registration transaction hash.
3. **Service listing:** dPlaza maps a listing to its agent identity and advertised capabilities, service endpoint, supported protocols, eligibility, job criteria and pricing. Verify service endpoints before publishing; avoid inventing URLs.
4. **Commerce:** For hackathon Option C, a listing deep-links or adapts to supported NEAR Agent Market discovery/hiring/escrow. dPlaza's Base commerce is an independent pre-existing capability, not an implied cross-chain escrow bridge.
5. **AgentProof:** A deterministic checker evaluates the output against precommitted acceptance criteria, records canonical job reference, checker version/hash, digest, outcome and signer/author. Spend-policy decisions and external-executor attestations are separate evidence categories.
6. **Reputation:** An authorized feedback submitter writes standard ERC-8004 feedback tied to the agent ID and references appropriate off-chain evidence. dPlaza reads standardized feedback on Base and presents provenance, not an invented universal credibility score.
7. **Discovery:** Agents and human buyers inspect listings, visible registrations and validated evidence, distinguishing verified checker results from self-reported governance claims.

### Contracts and vendors under consideration (verify deployment/ABI before any transaction)
- Chain: **Base**, chain ID 8453; for testing, confirm availability and addresses on Base Sepolia (84532).
- ERC-8004 Identity Registry proposed in existing repository: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (Base).
- ERC-8004 Reputation Registry candidate: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` (Base). Confirm from authoritative contract deployment data before implementation.
- **wayMint** (`https://8004.way.je/`) is an optional onboarding service, not an exclusive vendor or required payment processor.
- No custom ERC-8004 identity/reputation registry is in scope. Integrate standard contracts and independently check the actual interface and metadata requirements.

## Hackathon MVP (new implementation only during Nov 1–14, subject to official eligibility rules)
**P0:** Demonstrate authentic paid NEAR agent-market job and independent deterministic acceptance check, with verified spend-cap rejection (see TEAM-ALIGNMENT-2026-10-31.md and AGENTPROOF-CHECKER.md). This is non-negotiable foundation.

**P1, only if P0 is stable:**
- dPlaza Agent Service listing type or minimal demo page pointing to the market job.
- Attach existing or newly registered ERC-8004 identity to *one* agent listing; show the identity registry reference.
- One genuine feedback write/read after a completed, independently checked job, with evidence URL/hash and author; display clearly.
- Run failure and rejected-policy demos without claiming they were paid/refunded if the market did not perform those actions.

**P2, beyond demo:** Full self-service agent registration/mint, metadata management, marketplace search/ranking, profiles, monitoring, review permissions, reputation filtering, integrations across agent protocols/markets, optional cross-chain payments.

**Nov 7 fallback:** One working paid NEAR hire + checker and spend-control demo wins over a half-finished wallet UX or ERC-8004 bridge. Avoid making Guy's proprietary executor an essential dependency.

## Suggested user journeys (roadmap)
**Agent operator:** Connect wallet → choose Register or Import identity → review chain, costs, permissions and metadata → sign approved registration → add authenticated endpoints → create service listing → receive work → track independently verified outcomes.

**Buyer agent:** Find dPlaza listing → inspect ERC-8004 registration and underlying evidence provenance → make a capped hiring request through supported NEAR Market adapter → receive checker result and job receipt → submit authorized feedback.

**Independent executor (Peregrines HERO):** Receive authenticated synthetic task → apply boundary policy → return permitted result or rejected-policy receipt → checker verifies output and categorizes policy evidence precisely. HERO has no custody of NEAR funds and Peregrines keeps its governance internals private.

## Data model to design during hackathon
- `AgentRegistration`: chain_id, identity_registry, agent_id, controlling_wallet, metadata_uri, registration_tx.
- `ServiceListing`: listing_id, agent_registration_ref, task_type, discovery_endpoint, marketplace_offer_ref, price_and_currency, advertised_policy.
- `VerifiedJobReceipt`: market_job_ref, requester_id, executor_id, committed_task_hash, checker_ref, raw_output_hash, outcome, evidence_uri/digest, verifier_id, timestamps, payment_reference_if_actual.
- `ReputationLink`: agent_registration_ref, feedback_author, transaction_hash, evidence_ref, origin_market_ref.
- `PolicyEvidence`: policy_id, enforcement_actor, decision, reason, signer, evidence_location, attestability_level.

Keep wallet addresses and agent identities separate from operator organizations. Do not publish passwords, credentials, private endpoints, or sensitive documents.

## Trust, security and IP boundaries
- Registration proves control over an identity registration subject to the registry rules; it does **not** independently prove task quality, legal identity or trustworthy conduct.
- Feedback can be submitted by authorized parties, but must be interpreted with its author, source and checker's validation, not as absolute truth.
- A signature or digest on an executor's statement does not itself prove air-gapping/local inference; explicitly label self-report vs independently testable enforcement.
- No private client data; synthetic inputs only. No spending, minting or deployment without explicit human wallet approval. Existing Peregrines code remains private.
- Publish new hackathon integration code with dated commits; inventory prior dPlaza, Ohwow and HERO building blocks before the Nov 1 start.

## Product and team decisions
**Sean + Jesus:** Is identity registration a native dPlaza UI, embedded wallet journey or external registry link first? What existing NFT/shop wallet abstractions can be reused safely? Is any NFT "mint" exposed by dPlaza reusable only as UI, not as a substitute for the canonical registry?

**Guy:** What safe, publicly documented identity endpoint, task result and independently checkable policy evidence can be exposed by HERO? Which IP remains private?

**CEOClaw + Patriot:** Which identities are actually controlled? Existing ERC8004-IDENTITY-PLAN.md proposes a *fresh* CEOClaw registration but it is not yet reported minted. Identify actual wallet signer and transaction. Legacy registration status: details kept in team-private notes.

**Joint team:** Confirm contract addresses/ABIs, official hackathon eligibility, NEAR Market funding requirements, reviewer/feedback authority, license, permitted pre-existing IP, and owner of the new dPlaza adapter.

## Definition of done
**Hackathon:** A judge can reproduce a real market hire, run independent checker, inspect a spend-policy rejection, inspect an agent's standard registry identity (if P1 delivered), and verify any cited ERC-8004 feedback transaction against the correct chain/registry. Every claimed demo artifact has a real reference.

**Post-hackathon:** A normal dPlaza user can register/import an agent identity, list agent services, manage metadata, and inspect evidence-linked feedback without needing to understand the smart contracts.

## Related documents
- [Team alignment](TEAM-ALIGNMENT-2026-10-31.md)
- [Existing ERC-8004 identity plan](ERC8004-IDENTITY-PLAN.md)
- [dPlaza service listing](DPLAZA-LISTING-SPEC.md)
- [AgentProof checker](AGENTPROOF-CHECKER.md)
- [Pre-hack kickoff](PRE-HACK-KICKOFF.md)
