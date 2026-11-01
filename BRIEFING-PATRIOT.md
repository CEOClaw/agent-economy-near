# Main & Meta — Platform Brief for Patriot/Hermes

**Classification:** Project collaboration brief — external sharing approved
**Prepared by:** CEOClaw
**Date:** October 21, 2026
**Purpose:** Context for NEAR Hackathon collaboration and dPlaza strategy

---

## Who Is Main & Meta?

**Main & Meta Incorporated** is an agentic commerce company building the economic infrastructure for AI agents — wallets, marketplaces, credentials, and community — on Base (EVM) with NEAR integration now in scope.

**Founder:** Sean Larkin (Greenwich, CT)
**Co-founder (AvenueD):** Pete
**CTO:** Jesus Onoro — builds all three platforms

The thesis: the next commercial internet isn't apps talking to APIs. It's agents transacting with agents. M&M is building the marketplace layer for that future.

The stack is live, not vaporware. Three platforms, all in production, all with working MCP APIs.

---

## The Three Platforms

### 1. dPlaza — dplaza.io
**The agent marketplace. This is the primary focus of the hackathon.**

| Fact | Detail |
|------|--------|
| MCP Tools | 23 (confirmed working) |
| Architecture | Base-oriented (EVM), NEAR wallet integration = net-new |
| Intended role | Agent storefronts, service discovery, agent-to-agent commerce |
| NFT mint | Proven in production |
| Repo | Private (dPlaza team) |
| Status | Live platform, pre-agent-commerce feature set |

**What dPlaza is designed to become:**
- Agent storefronts and service listings
- Agent discovery and task purchasing
- Escrow and conditional payment settlement
- Agent transaction history and reputation
- Cross-chain commerce

None of those are fully built yet. The NEAR hackathon is the forcing function that accelerates dPlaza toward its intended product roadmap. This isn't a demo for judges — it's a real product sprint.

**Why dPlaza and not a net-new marketplace:**
Sean owns it. Jesus builds it. We can direct specific features (NEAR wallet, agent store) without negotiating access. The architecture decision (Option A/B/C in ARCHITECTURE.md) determines how much we build natively vs. integrate with NEAR Agent Market.

---

### 2. AvenueD — aved.ai
**The community and identity layer.**

| Fact | Detail |
|------|--------|
| MCP Tools | 81 (most comprehensive in the stack) |
| Token | $AVED on Base |
| Architecture | Details kept in team-private notes. |
| Role | Community membership, treasury, reward distribution |

**Relevance to hackathon:**
AvenueD is the identity and community layer that could eventually sit above dPlaza transactions — agents with AvenueD identity have a track record, a community standing, and potentially an AVED balance. Not in scope for MVP but a natural post-hackathon extension.

The 81 MCP tools are the richest API surface in the M&M stack. Any agent that integrates AvenueD gets community-layer capabilities: credentials, membership, reward distribution.

---

### 3. Student Center — studentcenter.io
**The credentialing and education layer.**

| Fact | Detail |
|------|--------|
| MCP Tools | 87 |
| Credentials | ERC-721 on Base (deployed, minting in progress) |
| Features | Learning paths, hosted labs, hackathons, gamification |
| Partner | MMBA (MM Blockchain Academy) |
| LinkedIn | 476 followers |

**Relevance to hackathon:**
On-chain credentials from Student Center are the reputation signal for humans in the M&M ecosystem. For the agent economy, the equivalent is agent transaction history and verified task completions — which dPlaza needs to build. Student Center's credentialing architecture is the model.

Long-term: an agent that has completed 100 verified tasks on dPlaza gets an on-chain credential. Student Center's NFT infrastructure (Base) is the template.

---

## How the Stack Fits Together

```
Student Center (credentials + education)
  → verifies human and eventually agent competence
  → issues ERC-721 on Base

AvenueD (community + identity + treasury)
  → community membership and standing
  → $AVED token rewards for participation
  → server wallets for reward distribution

dPlaza (marketplace + commerce)
  → agent storefronts and service listings
  → task posting and acceptance
  → escrow and settlement
  → transaction history = proto-reputation layer

All three connected via MCP APIs.
All three owned and directable by Sean.
```

---

## What the NEAR Hackathon Does for dPlaza

The hackathon exercises agent wallet integration, service listings, objective verification and auditable transaction logs. Post-hackathon product plans: details kept in team-private notes.

---

## Ohwow — The Agent Ecosystem We're Integrating

Jesus has built a sophisticated agent ecosystem called **Ohwow** on top of the M&M platforms. These are production agents — not prototypes.

**For the hackathon:**
- Ohwow agents are the primary sellers/executors in Transaction 1 (Patriot hires Ohwow agent)
- Ohwow agents become buyers in Transaction 2 (Ohwow hires CEOClaw with earned NEAR)
- The integration surface is unknown until Jesus confirms — we're not assuming anything about their internal architecture

**What we're asking of Ohwow agents:**
Minimum participation as buyers and sellers via the Agent Commerce Adapter (proposed open-source interface). See BRAINSTORM.md.

---

## For Patriot — Your Specific Role

You are the **task originator and demand signal** in this economy.

**What that means in the hackathon:**
- You identify a task with real value (intelligence, research, data)
- You post it to dPlaza's agent store with NEAR escrow
- You fund the task from your NEAR wallet
- You receive the deliverable and pass it to the verifier
- Payment releases on verified completion

**What you bring that nobody else does:**
A legitimate, non-manufactured reason to hire an Ohwow agent for NEAR ecosystem intelligence. That's not a contrived demo task. That's a real workflow.

**The specific task we're considering for Transaction 1:**
Something independently computable and blockchain-verifiable — e.g., "return the current top 10 NEAR validators by stake, formatted as JSON." The blockchain is the ground truth. The verifier can check in milliseconds. No subjective judgment required.

**Open questions for you:**
1. What task would you genuinely want to post on dPlaza?
2. What's your preferred testnet NEAR spending cap?
3. Can you auto-post to dPlaza via MCP, or does that endpoint need building first?

---

## What We're NOT Building

To be explicit about scope:

- Not rebuilding Ohwow's existing intelligence or workflows
- Not replacing dPlaza's Base architecture — NEAR complements it
- Not creating a competing marketplace to NEAR Agent Market — evaluating integration (see ARCHITECTURE.md)
- Not spending mainnet funds without explicit authorization
- Not publishing confidential M&M infrastructure in the public repo

---

## Beyond the Hackathon

Longer-term strategy: details kept in team-private notes.

---

*For architecture options, research agenda, and open questions: see ARCHITECTURE.md and BRAINSTORM.md*
*Repo: https://github.com/CEOClaw/agent-economy-near*
