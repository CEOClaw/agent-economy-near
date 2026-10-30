# ERC-8004 Identity Plan — AgentProof Hackathon
*Prepared Oct 30, 2026 — ready to execute when Sean is home*

---

## Overview

ERC-8004 (wayMint at 8004.way.je) is the agent identity standard we need for AgentProof reputation.
- Chain: **Base Mainnet**
- Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Proof method: Basename/ENS + SIWE (Sign In With Ethereum) — Sean signs once with Coinbase wallet
- Each identity = soulbound ERC-721 NFT + IPFS metadata + public certificate page

We have a prior registration ("Hashed Bridge" / OpenClaw harness, token #29,998) locked in Synthesis custody.
**Plan: mint fresh CEOClaw identity on Base. Better name, controlled wallet, proper metadata.**

---

## Identity 1 — CEOClaw (Primary)

**To pin at:** `POST https://8004.way.je/api/pin`

```json
{
  "name": "CEOClaw",
  "description": "AI Chief of Staff — builds products, coordinates agent workflows, verifies delivered work, and manages operations for CEOClaw LLC. Harness: OpenClaw. Operator: Sean Larkin.",
  "services": [
    { "name": "A2A", "endpoint": "https://ceoclaw.ai/a2a" },
    { "name": "MCP", "endpoint": "https://ceoclaw.ai/mcp" }
  ],
  "supportedTrust": ["reputation", "agentproof"],
  "operator": "ceoclaw.ai",
  "harness": "OpenClaw",
  "hackathon": "NEAR AgentProof — Nov 1-14, 2026"
}
```

---

## Identity 2 — Patriot (Requester agent on NEAR)

```json
{
  "name": "Patriot",
  "description": "Frontier research and intelligence agent for CEOClaw. Runs on Horus (beam:cloud 501B). Acts as requester in NEAR Agent Market — hires agents, evaluates delivery, enforces spend limits. Operator: CEOClaw LLC.",
  "services": [],
  "supportedTrust": ["reputation", "agentproof"],
  "operator": "ceoclaw.ai",
  "harness": "OpenClaw / Horus",
  "hackathon": "NEAR AgentProof — Nov 1-14, 2026"
}
```

---

## What Sean Needs to Do (when home)

1. **Open `8004.way.je`** in browser with Coinbase Wallet connected
2. **Register "CEOClaw"** — complete SIWE (one wallet signature, ~30 seconds)
3. **Optional Coinbase attestation** for Verified Human badge
4. CEOClaw handles everything else (metadata pin, IPFS, endpoint config)

**Wallet to use:** whichever Base wallet holds the USDC we'll use for the hackathon
(avoids fragmentation — identity + payments from same wallet)

---

## The Broader Offering — "Agent Onboarding via AgentProof"

**Service concept:**
> CEOClaw registers your agent's ERC-8004 identity as part of AgentProof onboarding.
> Your reputation starts the moment your first verified job closes.

**Why this works as a product:**
- Most agents/operators don't know ERC-8004 exists or how to register
- Registration requires: knowing wayMint, having a wallet, completing attestation, pinning IPFS metadata, understanding the standard
- CEOClaw drives the whole flow — operator just signs once
- Natural funnel: AgentProof job → ERC-8004 reputation → more jobs → more reputation

**Hackathon demo use:**
- Register CEOClaw + Patriot before Nov 1 ✅
- HERO (Guy's agent): register if Guy confirms participation — he signs with his wallet
- Ohwow: Jesus registers as part of the demo setup
- Live: complete a verified job → write ERC-8004 reputation feedback → check certificate at 8004.way.je/agent/base/{id}

---

## Prior Identity — Status Unknown

- Token #29,998 — name: "Hashed Bridge", harness: OpenClaw
- Held in Synthesis custodial wallet
- Self-custody transfer was "waiting on Synthesis to open the window" (March 2026)
- Status unknown — worth checking if the window is open, but not blocking
- Mint fresh CEOClaw identity instead; "Hashed Bridge" can stay as historical artifact

---

*Ready to execute. CEOClaw will handle the API calls. Sean signs once.*
