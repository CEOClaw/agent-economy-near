<!-- Official NEAR HACKATHON agent brief — sourced from https://nearhackathon.com/HACKATHON.md on 2026-10-21 -->
<!-- Re-fetch before submitting: dates and rules may change -->

> **Official-source snapshot from October 21, 2026, not a live rules feed.** Recheck [the organizer's official instructions](https://nearhackathon.com/HACKATHON.md) before submitting. This document records contest requirements, while [README.md](README.md) and [ARCHITECTURE.md](ARCHITECTURE.md) describe our current project. The repository creation date alone does not establish code eligibility; preserve qualifying-code provenance.

# NEAR HACKATHON - HACKATHON.md

## Key Facts

| Fact | Value |
|------|-------|
| Website | https://nearhackathon.com |
| Hackathon starts | 2026-11-01T00:00:00Z |
| Development ends | 2026-11-14T23:59:00Z |
| Judging starts | 2026-11-16T00:00:00Z |
| Results announced by | 2026-11-18T23:59:00Z |
| Submission form | https://nearhackathon.com/#apply |
| Submission API | POST https://nearhackathon.com/api/applications |
| NEAR docs | https://docs.near.org/ |
| NEAR Discord | https://discord.gg/nearprotocol |

## Our Track Selection

| id | Track | Why us |
|----|-------|--------|
| `agents` | Agent Economy | Primary — agent hires agent, earns, spends |
| `swarms` | AI Swarms | Multi-agent coordination, GitHub Central already live |
| `business` | Autonomous Business | dPlaza as AI-native business infrastructure |
| `security` | AI Security & Defense | Agent spending limits, function-call keys, auditable logs |

## Submission Checklist

- [ ] Public repository (can stay private during build, must be public by Nov 14 23:59 UTC)
- [ ] Demo post on X: say "built at NEAR HACKATHON" + video/screenshots attached
- [ ] Sean's NEAR account address confirmed (mainnet, named or 64-char implicit)
- [ ] Sean reads consent notice verbatim and confirms
- [ ] Project name decided (2-80 chars, unique across hackathon)
- [ ] "What we built" description drafted (20-2000 chars)
- [ ] Generate requestId once: `node -e 'console.log(crypto.randomUUID())'`
- [ ] Print full JSON payload, Sean confirms, then submit

## Submission API Contract

```sh
curl -sS -X POST https://nearhackathon.com/api/applications \
  -H 'Content-Type: application/json' \
  -d '{
    "requestId": "<uuid-generated-once>",
    "projectName": "<2-80 chars, unique>",
    "leadName": "<2-80 chars>",
    "email": "<max 160 chars>",
    "size": "2 - 4",
    "tracks": ["agents","swarms","business"],
    "nearAddress": "<mainnet NEAR account>",
    "projectUrl": "https://github.com/CEOClaw/agent-economy-near",
    "demoUrl": "<link to X demo post>",
    "idea": "<20-2000 chars: problem, product, how NEAR fits>",
    "consent": true
  }'
```

⚠️ SPAM TRAP: Do NOT include a `website` field — any non-empty value rejects the submission.
⚠️ ONE SHOT: Submission cannot be edited after sending. Confirm everything first.
⚠️ Same requestId on retries (503) — do not generate a new one.

## Track IDs Reference

| id | Track |
|----|-------|
| `defi` | Unstoppable DeFi |
| `thesis` | Investment Thesis |
| `privacy` | Privacy & Private AI |
| `business` | Autonomous Business |
| `swarms` | AI Swarms |
| `security` | AI Security & Defense |
| `agents` | Agent Economy |
| `realworld` | Real-World Money |
| `games` | Games With Real Economies |
| `nfts` | NFTs That Do Something |
| `memecoins` | Memecoins With Mechanics |
| `social` | Social Money |
| `open` | Open Innovation |

## README Guidance (AI Judges)

**Judges include Claude Code & Codex (Anthropic & OpenAI).** Write the README for a machine reader as well as a human one:
- What the product is
- The problem it solves
- How to try it: "do X → see Y" steps a judge can follow
- No marketing language

## Ecosystem Partners (Relevant to Us)

| Partner | What it is | Relevance |
|---------|-----------|-----------|
| **OutLayer** | Secure transactions for AI agents | DIRECTLY relevant — agent spending limits, wallet security |
| NEAR Intents | Cross-chain execution | Settlement layer |
| HOT | Chain abstraction | Cross-chain without bridging |
| Trezu | Multisig treasury for Web3 teams | dPlaza treasury layer |
| NEAR.AI | Private AI inference (TEE) | Private-inference angle |
| Aurora | Ethereum on NEAR | Base↔NEAR bridge if needed |

**OutLayer docs:** https://app.outlayer.ai/docs/getting-started — investigate before building custom spending-limit logic.

## Judges

1. Illia Polosukhin — NEAR Protocol
2. Eddy Lazzarin — a16z crypto
3. Mert Mumtaz — Helius
4. Avichal Garg — Electric Capital
5. Kain Warwick — Synthetix & Infinex
6. Haseeb Qureshi — Dragonfly
7. Stepan Gershuni — cyber•Fund
8. **Claude Code & Codex — Anthropic & OpenAI (AI judges)**
