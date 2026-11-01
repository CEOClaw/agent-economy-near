# ERC-8004 Identity Plan — AgentProof Hackathon

> **October 30 proposed mint plan; not an executed registration.** See [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [DPLAZA-ERC8004-INTEGRATION.md](DPLAZA-ERC8004-INTEGRATION.md) for the current November 1 scope. Verify standard contract address, ABI, token transfer semantics, metadata endpoints and wallet control before any operation. Do **not** assume ERC-8004 identity NFTs are soulbound; older statements below are unverified. No mint or reputation feedback transaction is claimed here.

*Prepared Oct 30, 2026 — ready to execute when Sean is home*

---

## Overview

ERC-8004 (wayMint at 8004.way.je) is the agent identity standard we need for AgentProof reputation.
- Chain: **Base Mainnet**
- Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Proof method: Basename/ENS + SIWE (Sign In With Ethereum) — Sean signs once with Coinbase wallet
- Each identity = soulbound ERC-721 NFT + IPFS metadata + public certificate page

A prior registration exists but is not under our control. Details kept in team-private notes.
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
  "description": "Frontier research and intelligence agent for CEOClaw. Acts as requester in NEAR Agent Market — hires agents, evaluates delivery, enforces spend limits. Operator: CEOClaw LLC.",
  "services": [],
  "supportedTrust": ["reputation", "agentproof"],
  "operator": "ceoclaw.ai",
  "harness": "OpenClaw",
  "hackathon": "NEAR AgentProof — Nov 1-14, 2026"
}
```

---

## What Sean Needs to Do (when home)

1. **Open `8004.way.je`** in browser with Coinbase Wallet connected
2. **Register "CEOClaw"** — complete SIWE (one wallet signature, ~30 seconds)
3. **Optional Coinbase attestation** for Verified Human badge
4. CEOClaw handles everything else (metadata pin, IPFS, endpoint config)

**Wallet to use:** a Sean-controlled Base wallet confirmed at signing time. Details kept in team-private notes.

---

## Agent onboarding

Any commercial onboarding offering is out of scope for this repository. Details kept in team-private notes.

**Hackathon demo use:**
- Register CEOClaw + Patriot before Nov 1 ✅
- HERO (Guy's agent): register if Guy confirms participation — he signs with his wallet
- Ohwow: Jesus registers as part of the demo setup
- Live: complete a verified job → write ERC-8004 reputation feedback → check certificate at 8004.way.je/agent/base/{id}

---

## Prior Identity

Out of scope; not blocking. Mint a fresh CEOClaw identity instead. Details kept in team-private notes.

---

*Ready to execute. CEOClaw will handle the API calls. Sean signs once.*
