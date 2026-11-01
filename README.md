# Agent Economy on NEAR

---

> **⚠️ Planning baseline: see [PRE-HACK-KICKOFF.md](./PRE-HACK-KICKOFF.md)**  
> The October 30, 2026 kickoff document supersedes the architectural assumptions below for active planning. It defines the two engineering tracks, agreed implementation strategy (Option C hybrid), execution gates, and what remains unverified. Read it before treating anything in this README as the current plan.
>
> Pre-hack documentation added October 30: [AGENTPROOF-CHECKER.md](./AGENTPROOF-CHECKER.md) · [NEAR-MARKET-RESEARCH.md](./NEAR-MARKET-RESEARCH.md) · [DPLAZA-LISTING-SPEC.md](./DPLAZA-LISTING-SPEC.md)

---

## Historical Architecture (pre-kickoff)

*The content below reflects the repository as of October 21, 2026. Some assumptions (testnet-first, custom NEAR escrow contract, independent dPlaza marketplace) have been superseded by the kickoff plan. Retained as historical context.*

---

> *"Agent hires agent. Pays in NEAR. Delivers via MCP. Economic cycle, not just API integration."*

**NEAR AI Hackathon — November 1–14, 2026**
**Tracks:** Agent Economy (primary) · AI Swarms (secondary)

---

## What Is This?

A live, working multi-agent economy where AI agents autonomously hire, pay, and deliver work to each other — using NEAR as the payment and trust layer, and **dPlaza** as the marketplace.

This isn't a demo built for a hackathon. We have a real multi-agent team operating today. We're adding NEAR as the economic rails.

This project has **four simultaneous objectives** — the hackathon is one of them.

---

## Four Objectives

| # | Objective | What success looks like |
|---|-----------|------------------------|
| 1 | **Ohwow Agent Economy** | Jesus's existing agents can buy, sell, and earn via dPlaza |
| 2 | **NEAR Hackathon** | Technically credible submission, competitive, relationships built |
| 3 | **dPlaza Product Expansion** | Agent storefronts, discovery, escrow, reputation — real product |
| 4 | **Marketing & Thought Leadership** | M&M demonstrably building the agentic economy, publicly |

---

## The Economic Cycle

The goal is a **repeatable economic cycle**, not a one-way API call:

```
Patriot (signals agent)
  → discovers task opportunity
  → posts to dPlaza agent store
  → locks NEAR escrow

Ohwow Agent (Jesus's ecosystem)
  → accepts task
  → executes and delivers
  → receives NEAR payment

Ohwow uses earned NEAR
  → hires CEOClaw for a follow-on task
  → CEOClaw delivers
  → escrow releases

Loop. Agents earning and spending autonomously.
```

No human in the loop for execution. The cycle runs itself.

---

## Key Open Question: Build vs. Integrate

NEAR AI already operates **[Agent Market](https://market.near.ai/)** — with agent listings, paid jobs, payments, disputes, and reputation.

**We are not blindly building a duplicate.** Three architecture alternatives are under evaluation:

| Option | Description |
|--------|-------------|
| **A — Independent** | dPlaza as its own NEAR-native marketplace |
| **B — Integrated** | dPlaza as a storefront layer ON TOP of NEAR Agent Market |
| **C — Hybrid** | Use NEAR Agent Market rails where useful; own the product layer |

Full comparison in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## The Team

| Agent | Role | Stack |
|-------|------|-------|
| **Patriot** | Task originator, signals intelligence | Local agent |
| **Ohwow Agents** | Task executors, earners, buyers | Jesus's ecosystem |
| **CEOClaw** | Operator, downstream task executor | OpenClaw / Claude |
| **Chief** | Market intelligence, strategy | Grok-based |
| **Chat** | Reasoning, architecture, research | GPT-based |
| **Sean** | Human in the loop (when needed) | Greenwich, CT |

## Judges

| Judge | Org |
|-------|-----|
| Illia Polosukhin | NEAR Protocol |
| Eddy Lazzarin | a16z crypto |
| Mert Mumtaz | Helius |
| Avichal Garg | Electric Capital |
| Kain Warwick | Synthetix & Infinex |
| Haseeb Qureshi | Dragonfly |
| Stepan Gershuni | cyber•Fund |
| **Claude Code & Codex** | **Anthropic & OpenAI (AI judges)** |

All agents coordinate via [GitHub Central](https://github.com/CEOClaw/Central). This repo is the hackathon workspace.

---

## Existing Assets

- **dPlaza** — M&M product, Base-oriented, being expanded for agent commerce
- **Ohwow agent ecosystem** — Jesus's production agents, sophisticated, ready to integrate
- **GitHub Central** — live multi-agent coordination, already working today
- **CEOClaw + MCP** — operational agent with task endpoint capability
- **Patriot** — signals bot with existing NEAR ecosystem analysis
- **Base infrastructure** — existing blockchain layer; NEAR complements, doesn't replace
- **NEAR Intents** — $24B+ volume, 35+ chains, chain abstraction already proven

---

## Proposed MVP (Nov 1–14)

**Transaction 1:** Patriot hires an Ohwow agent for a narrowly defined, objectively verifiable task. Verifier confirms. NEAR escrow releases.

**Transaction 2:** Ohwow uses earned NEAR to hire CEOClaw. CEOClaw delivers. Loop closes.

Testnet first. Auditable logs. Explicit spending policies. No mainnet funds without sign-off.

---

## What We're Building

- **dPlaza Agent Store** — agent listings, capability discovery, NEAR wallet integration
- **CEOClaw MCP Task Endpoint** — listens, executes, triggers escrow release
- **Ohwow Agent Interface** — minimum integration for existing agents to buy/sell
- **NEAR Escrow Contract** — lock on task post, release on objective verification
- **Verifier Module** — automated, objective pass/fail on task completion

Scope in [BRAINSTORM.md](BRAINSTORM.md). Architecture in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Timeline

| Date | Milestone |
|------|-----------|
| Oct 21 | Repo live, team aligned |
| Oct 25–31 | Research: NEAR ecosystem, Agent Market, Ohwow integration surface, hackathon rules |
| Nov 1 | Hackathon opens — escrow contract drafted, architecture locked |
| Nov 7 | dPlaza agent store live (testnet), MCP endpoint live |
| Nov 10 | Transaction 1 complete: Patriot → Ohwow |
| Nov 12 | Transaction 2 complete: Ohwow → CEOClaw. Full cycle demo recorded. |
| Nov 14 | Submission |

---

## Why We Win

- **Real team, real coordination** — GitHub Central is live today, not a mockup
- **Real marketplace** — dPlaza exists; we're adding agent rails to a working product
- **Real economic cycle** — earn and spend, not just pay and receive
- **Apparently uncontested angle** — DeFi/Games/Memecoins crowded; professional-grade agent economy appears open (competitive research pending — Chief owns this before we claim it publicly)
- **AI judges** — Claude Code & Codex are on the panel; README written for machine readability as well as human
- **NEAR alignment** — their thesis (identity, agent rails, AI money) is exactly ours

---

## Security & Wallet Policy

- Testnet first, always
- Explicit spending caps per agent per session
- Auditable transaction logs committed to this repo
- No mainnet funds without explicit human sign-off
- No secrets or confidential infrastructure in public files

---

## Links

- [dPlaza](https://dplaza.io) — the marketplace
- [NEAR Agent Market](https://market.near.ai/) — existing NEAR infrastructure (evaluate, don't duplicate)
- [GitHub Central](https://github.com/CEOClaw/Central) — agent coordination hub
- [CEOClaw](https://ceoclaw.ai) — operator agent

---

*Built by a multi-agent team. Paid in NEAR. Designed to last beyond the hackathon.*
