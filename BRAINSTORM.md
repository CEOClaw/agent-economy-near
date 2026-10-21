# Brainstorm — Open Questions & Research Agenda

**Status:** Pre-implementation research phase
**Updated:** October 21, 2026
**Participants:** CEOClaw, Chat, Chief, Patriot, Sean

*Material statements below are classified as: ✅ Verified fact | 📋 Management-provided fact | 🔷 Hypothesis | 💡 Proposal | ❓ Open question*

---

## The Final Question (Our North Star)

> If we had only 14 days to demonstrate that autonomous agents can create real economic value through dPlaza and NEAR, what is the most compelling, technically achievable, defensible demonstration we could build — and how does that become a lasting product after the hackathon?

---

## Top 5 Non-Obvious Discoveries (to validate)

1. **NEAR Agent Market already exists** ✅ — market.near.ai has listings, paid jobs, payments, disputes, reputation. This is the most important fact. See [ARCHITECTURE.md](ARCHITECTURE.md) for how we respond to it.

2. **Chain Signatures = cross-chain wallet without migration** 🔷 — NEAR's Chain Signatures allow agents to control wallets on other chains (including Base) without bridging. If confirmed, this means Ohwow agents could potentially transact in NEAR without abandoning their Base-native architecture.

3. **Function-call access keys = agent-safe spending limits** 🔷 — NEAR has native key types that can restrict an agent's wallet to specific contracts and spending caps. This is the security model we need for autonomous agents — may eliminate need for custom spending policy logic.

4. **x402 payment protocol** ❓ — Emerging standard for HTTP-native micropayments between agents. If NEAR supports it, CEOClaw's MCP endpoint could accept payment natively without custom escrow. Research needed.

5. **Professional services angle is uncontested** 📋 — DeFi, games, memecoins are crowded. No major hackathon submission is targeting agent-to-agent professional services (research, analysis, intelligence, document work). That's our lane.

---

## Research Assignments

### NEAR Ecosystem
- [ ] NEAR Intents: what exactly can agents do? (✅ $24B+ volume — *verify agent-specific capabilities*)
- [ ] NEAR Agent Market API: listings, job posting, payment, dispute endpoints
- [ ] Chain Signatures: can Ohwow (Base-native) agents use NEAR without full migration?
- [ ] Function-call access keys: spending limits, contract restrictions, agent wallet patterns
- [ ] Shade Agents: what are they? (❓ referenced in NEAR docs, unclear)
- [ ] IronClaw: what is this? (❓ referenced, needs investigation)
- [ ] x402 protocol: NEAR support? Integration path?
- [ ] A2A (Agent-to-Agent) standard: Google's draft. Does NEAR support it?
- [ ] Existing NEAR escrow contract templates (don't build what exists)
- [ ] NEAR developer grants and ecosystem support programs

### Hackathon Intelligence
- [ ] Official rules: eligibility, pre-existing code policy, public repo requirements
- [ ] Read official HACKATHON.md (if published)
- [ ] Submission format: demo requirements, what judges actually see
- [ ] Judging criteria: how are tracks scored?
- [ ] Available resources: mentors, office hours, ecosystem contacts
- [ ] Submission deadline: exact time Nov 14?
- [ ] Prize structure: $250K total — how split across tracks?

### Competitor Intelligence
- [ ] What's already submitted/announced for Agent Economy and AI Swarms tracks?
- [ ] Similar projects: agent wallet standards, autonomous payment systems
- [ ] How does dPlaza differentiate from NEAR Agent Market (must have a clear answer)?

### Ohwow Integration (with Jesus's input — assumptions only below)
- [ ] What API/interface do Ohwow agents currently expose?
- [ ] Do they have wallet capability today?
- [ ] Best-suited task types for a verifiable demo?
- [ ] Minimum integration surface to participate as buyer + seller?
- [ ] Any constraints on external NEAR infrastructure interaction?

### dPlaza Roadmap
- [ ] Current dPlaza architecture: Base-oriented, what does it support today?
- [ ] What's the minimum addition for agent storefronts + NEAR wallet?
- [ ] What can Jesus build in pre-Nov 1 prep vs. hackathon window vs. post-hackathon?

---

## Easter Egg Candidates

*(Non-obvious opportunities — confidence levels to be validated)*

| Discovery | Why It Matters | Confidence | Effort | Next Action |
|-----------|---------------|------------|--------|-------------|
| NEAR Agent Market integration (B or C) | Eliminate marketplace build, use existing rails | High | Low | Read Agent Market API docs |
| Function-call access keys | Native agent spending policy, no custom logic | Medium | Low | Read NEAR key docs |
| Chain Signatures for Base wallets | Ohwow agents transact in NEAR without migration | Medium | Medium | Prototype test |
| x402 for MCP task payment | HTTP-native payment, no escrow contract needed | Low | Low | Check NEAR x402 support |
| Patriot's NEAR signal score as a product | Patriot *already* provides NEAR analysis as a service — first demo task is obvious | High | Low | Define task spec |
| Professional services lane | Zero competition in this space | High | N/A | Own the narrative |
| NEAR ecosystem grants | Funding post-hackathon | Medium | Low | Check NEAR Foundation grants page |

---

## MVP Scope (Proposed — Not Approved)

### Transaction 1: Patriot hires Ohwow agent
- Patriot identifies research task (e.g., NEAR ecosystem analysis)
- Posts to dPlaza agent store with NEAR escrow
- Ohwow agent accepts, executes, delivers structured output
- Automated verifier checks objective criteria (format, completeness, accuracy markers)
- NEAR releases on pass

### Transaction 2: Ohwow earns and spends
- Ohwow uses earned NEAR to hire CEOClaw for follow-on task
- CEOClaw delivers via MCP endpoint
- Escrow releases
- Economic cycle complete — agents earned and spent autonomously

### What this demonstrates
- Agent discovery (dPlaza storefront)
- Agent hiring (task specification, escrow lock)
- Agent execution (Ohwow + CEOClaw as independent workers)
- Objective verification (automated, not human)
- Payment settlement (NEAR)
- Economic cycle (earn → spend → earn — not just transact)

### What this is NOT
- Not a full marketplace launch
- Not production mainnet
- Not a replacement for Ohwow's existing workflows
- Not spending real funds without explicit sign-off

---

## Security & Wallet Policy

- **Testnet first, always** — no mainnet until explicit human authorization
- **Spending caps** — function-call access keys or equivalent per agent per session
- **Auditable logs** — every transaction committed to this repo
- **No secrets in public files** — ever
- **Explicit authorization required** for: wallets, real funds, external contacts, submissions

---

## Open Questions for the Team

### For Jesus
1. What does an Ohwow agent's external interface look like today?
2. Do they have wallet/payment capability, or is that net-new?
3. What verifiable task could an Ohwow agent complete in a demo?
4. Any NEAR wallet experience in the Ohwow stack already?
5. What's your bandwidth Nov 1–14 for dPlaza additions?

### For Sean
1. Architecture choice: A / B / C — or decide after pre-Nov 1 research?
2. Is the dPlaza domain confirmed for the hackathon repo/demo?
3. NEAR developer account — do you need to register anything before Nov 1?
4. What's the public-facing story for M&M / marketing objective?

### For Patriot
1. What's the most useful task you could post to dPlaza as a demo buyer?
2. Can you auto-post to dPlaza via API, or does that need building?
3. Spending policy for testnet NEAR — what's the cap you're comfortable with?

### For Chief
1. Competitor landscape — who else is entering Agent Economy / AI Swarms?
2. Any NEAR ecosystem intel on what judges have reacted to in past hackathons?

### For Chat
1. Your NEAR Agent Market discovery is the most important input — can you pull Agent Market API docs and assess integration path?
2. x402 — do you have more on NEAR's support status?

---

## GitHub Issues (Proposed — Post Research Phase)

Once architecture is locked, open issues for:
- [ ] #1 — NEAR Agent Market API research report
- [ ] #2 — Ohwow agent integration spec (with Jesus)
- [ ] #3 — dPlaza agent store wireframe
- [ ] #4 — NEAR escrow contract selection / deployment
- [ ] #5 — CEOClaw MCP task endpoint
- [ ] #6 — Objective verifier design
- [ ] #7 — Testnet wallet policy and setup
- [ ] #8 — Demo script: Transaction 1 (Patriot → Ohwow)
- [ ] #9 — Demo script: Transaction 2 (Ohwow → CEOClaw)
- [ ] #10 — Submission writeup

---

*This document is a living brainstorm. Update as research answers open questions. Do not treat hypotheses as facts.*
