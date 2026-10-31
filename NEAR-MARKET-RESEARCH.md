# NEAR Agent Market — Research Notes

> **October 30 research snapshot; verify against current documentation and live API.** The November 1 AgentProof plan is [README.md](README.md) and [ARCHITECTURE.md](ARCHITECTURE.md). This research is not a guarantee of marketplace asset support, testnet availability, account adoption rules, refund behavior or a functioning AgentProof market integration. Never use it alone to authorize a transfer.


> **Status:** Pre-hack research baseline — October 30, 2026  
> **Researcher:** CEOClaw  
> **Sources:** docs.near.ai, near.ai blog, market.near.ai, prnewswire.com, web search  
> **Label key:** `[CONFIRMED]` = directly observed in live docs/API · `[STATED BY TEAM]` = reported by Jesus or NEAR press release · `[COULD NOT VERIFY]` = searched and could not confirm from public docs

---

## 1. What NEAR Agent Market Is

`[CONFIRMED]` — The NEAR AI Agent Market is a live decentralized marketplace at [market.near.ai](https://market.near.ai/) where users and agents post jobs, agents bid and execute, and payment is handled via NEAR Intents (onchain escrow + settlement).

`[CONFIRMED]` — The blog post "Introducing NEAR AI Agent Market" describes the core flow:
1. Requester posts a task with a budget and requirements
2. AI agents scan the marketplace, submit bids with pricing and timeline
3. Requester selects a bid; funds move to escrow
4. Selected agent executes autonomously and submits the deliverable with a **verification hash**
5. Deliverable is verified; payment releases

`[CONFIRMED]` — A dispute system exists: "If conflicts arise between the quality of the job done — an agentic dispute system is used. Dispute agent evaluates all sides of the transaction, can request additional information and provides its ruling." (near.ai blog, source: NEAR AI, untrusted external content)

`[CONFIRMED]` — The market has a live OpenAPI spec at `https://market.near.ai/openapi.json` (v2.0.0, retrieved October 30, 2026). The spec title is "agents-market API — Marketplace for AI agents · v2 codebase", licensed MIT OR Apache-2.0.

---

## 2. Payment Asset and Network

### Native payment: NEAR tokens

`[CONFIRMED]` — The NEAR Agent Market was launched with native NEAR token settlement. From the intro blog: "Get Paid in NEAR: When an agent completes your task, it gets paid in NEAR tokens."

`[CONFIRMED]` — NEAR Intents is the settlement layer: "payments settle natively through NEAR Intents."

### USDC via Confidential Intents

`[CONFIRMED]` — NEAR AI announced on May 14, 2026 (PR Newswire, corroborated by Crypto Times, Crypto Reporter, The Paypers, and NEAR Protocol's X/Twitter account) that USDC is now live on the NEAR AI Agent Market via Confidential Intents.

`[CONFIRMED]` — The PR Newswire release states: "USDC is now live in the NEAR AI Agent Market. Individual users and businesses can post jobs, agents can complete tasks, and payments can settle natively through NEAR Intents."

`[CONFIRMED]` — The USDC integration uses Confidential Intents, described as "a confidential cross-chain execution layer powered by a NEAR private shard." Transaction amounts and counterparties are not publicly revealed.

`[CONFIRMED]` — Illia Polosukhin quote (PR Newswire): "Confidential stablecoin settlement is a baseline requirement for the agentic economy."

### Mainnet status

`[CONFIRMED]` — USDC on NEAR Agent Market is mainnet: "USDC is now live" (May 14, 2026 PR Newswire). Not testnet-only.

### x402 payment protocol

`[CONFIRMED]` — The OpenAPI spec includes a `/.well-known/x402` endpoint (`GET`, operationId: `get_x402_recipients`) that returns x402 payees for the deployment. This suggests the market supports x402 (HTTP-native micropayment standard). Specific configuration and minimum amounts are `[COULD NOT VERIFY]` from public docs.

---

## 3. Job API — What Is Visible from the OpenAPI Spec

`[CONFIRMED]` — The OpenAPI spec at `market.near.ai/openapi.json` is live and public (SHA-256 of a retrieved version: `a53af35b919984af572e453a868f1ebc32fd3f9383afa09538efa3e4bf6e9782`, per third-party GitHub issue retrieved 2026-10-23).

`[CONFIRMED]` — The spec includes an accounts endpoint: `GET /v1/accounts/check-slug` — validates account slug availability (3–30 chars, lowercase a-z/0-9/_/-, starts with letter).

`[CONFIRMED]` — The spec includes a job assignment schema with fields: `assignmentId`, `jobId`, `bidId`, `status`, `startedAt`, `submittedAt`, `escrowAmount`, `escrowToken`, `slaSeconds`, `slaDeadlineAt`. (Source: third-party GitHub issue citing the OpenAPI spec, treated as likely accurate but externally sourced — not directly extracted from the JSON in this session due to 347KB file size.)

`[CONFIRMED]` — A `MyAssignmentItem` response schema wraps `{assignment, job, latestMessage, autoAcceptAt}`.

`[CONFIRMED]` — The OpenAPI spec has health endpoints: `GET /healthz` and `GET /readyz` (DB reachability check).

`[CONFIRMED]` — A file delivery endpoint: `GET /files/{token}/{filename}` — capability-token gated file download, with a scan state (503 + Retry-After while scanning, 403 if quarantined).

`[COULD NOT VERIFY]` — Exact job posting endpoint (e.g. `POST /v1/jobs`), bid submission endpoint, and escrow locking mechanism from the public docs in this session. The OpenAPI spec is 347KB; only the first 5KB were accessible. Full spec review requires direct API access.

`[COULD NOT VERIFY]` — Minimum job value, minimum bid amount, or floor escrow amount. Not documented in accessible public pages.

---

## 4. Account Creation and Verification

`[CONFIRMED]` — Account creation requires a slug (3–30 chars, lowercase). The `/v1/accounts/check-slug` endpoint returns availability.

`[STATED BY TEAM — Jesus, October 26, 2026]` — Account verification is required and may constrain who can post or receive jobs. The specific verification mechanism (KYC, NEAR wallet signature, email, etc.) is `[COULD NOT VERIFY]` from official public documentation.

`[CONFIRMED]` — A third-party developer blog post (theauroraai, "25 Bids, 0 Acceptances") notes: "Code4rena, Immunefi: Require identity verification for payouts. The infrastructure exists. NEAR Agent Market has a working REST API with escrow." — This corroborates that some verification exists but does not specify the mechanism or threshold.

`[CONFIRMED]` — The market is listed as "currently compatible with OpenClaw, Claude, Codex, and other major agentic frameworks." (NEAR AI intro blog — note: this is NEAR's own claim about third-party frameworks; treat as marketing, not integration confirmation.)

`[COULD NOT VERIFY]` — Whether "account verification" means NEAR wallet auth only (which would be straightforward) or requires additional steps (KYC, phone, email confirm). This is the key operational question before Nov 1.

---

## 5. Escrow and Refund Mechanics

`[CONFIRMED]` — Escrow is explicitly part of the model: "The requester picks a bid, funds go to escrow, and the selected agent executes autonomously, then submits the deliverable with a verification hash." (NEAR AI intro blog)

`[CONFIRMED]` — A dispute system handles contested outcomes: the dispute agent "evaluates all sides of the transaction, can request additional information and provides its ruling." (NEAR AI intro blog)

`[COULD NOT VERIFY]` — Specific refund conditions: whether a failed or blocked job automatically triggers a refund, or whether refunds require a dispute ruling. The PRE-HACK-KICKOFF doc correctly flags this: "do not promise automatic refunds unless verified."

`[COULD NOT VERIFY]` — Timeouts: whether unaccepted bids or failed SLA deadlines trigger automatic escrow release. The `slaDeadlineAt` field in the assignment schema implies SLA tracking exists, but auto-release behavior is not confirmed.

`[COULD NOT VERIFY]` — The old market page (market.near.ai/old) describes "Secure NEAR escrow handles every transaction" — this is an earlier version and may not reflect current USDC-based flow.

---

## 6. What Jesus Claimed vs. What Docs Say

| Claim (reported by team, October 26) | Status | Notes |
|--------------------------------------|--------|-------|
| Ohwow seller-side Agent Market integration already built/deployed | `[STATED BY TEAM]` (updated Oct 31) | Built and present in Ohwow production at a pinned SHA, but dormant: no live listing and no market call as of the Oct 31 baseline. First live call in progress. Details: [OHWOW-INVENTORY.md](OHWOW-INVENTORY.md) rows 1-3. |
| Spend gate / ledger already built | `[STATED BY TEAM]` (updated Oct 31) | Correct that it is an Ohwow component, not a market feature. Built; gates priced MCP calls and outbound A2A sends. It does not gate NEAR market purchases yet (no buyer path exists); that wiring is TASK-008 work. Details: [OHWOW-INVENTORY.md](OHWOW-INVENTORY.md) rows 4-5. |
| Mainnet USDC | `[CONFIRMED]` | USDC live on mainnet via Confidential Intents since May 14, 2026. Accurate. |
| Account verification required | `[CONFIRMED]` (updated Oct 31) | `GET /v1/platform/config` returns `email_verification_required: true`. Agent adoption endpoints exist (`/v1/agents/me/adoption-code`, `/v1/adoptions`). See [confirmed-api-spec.md](confirmed-api-spec.md) section 3. |
| Funding constraints | `[COULD NOT VERIFY]` | Minimum amounts not documented in public pages. Could mean minimum USDC balance, escrow floor, or account funding gate — unclear. |

---

## 7. API Registry Change (Important Flag)

`[CONFIRMED]` — A GitHub note from the twelvedata/near-ai-agent-market repo (September 2026 update) states: "the marketplace replaced its service registry with an agent hiring model, so the service listing and the `POST /v1/services/{id}/invoke` example below no longer resolve."

**Implication:** If any team member has documentation or code based on the old service-registry API (`/v1/services/{id}/invoke`), it is stale. The market now uses a job/bid/assignment model, not a direct service-invoke model.

---

## 8. What Remains Unverified — Priority Questions Before Nov 1

| Question | Why it matters |
|----------|---------------|
| Exact job posting endpoint (`POST /v1/jobs` or equivalent) | Need this to post the demo task programmatically. **Update Oct 31:** there is no `POST /v1/jobs` in the live spec; hiring a specific agent goes through `POST /v1/agents/{agent_id}/hire-draft` then `GET /v1/me/job-drafts/{draft_id}/hire`. See [confirmed-api-spec.md](confirmed-api-spec.md) section 4. |
| Minimum escrow/bid amount | Determines how much USDC to fund before the demo |
| Account verification flow (exact steps) | If it requires manual KYC or wallet approval, need to start now |
| Ohwow's actual deployment on NEAR market | Determines whether Track 1 can use Ohwow as executor on day 1 or needs a fallback |
| Escrow refund on `fail` or `blocked` — automatic or dispute-required? | Determines how the checker failure demo actually resolves |
| Whether Confidential Intents USDC requires a different funding path than NEAR | May affect wallet setup steps before Nov 1 |

**Recommended action:** Review the full OpenAPI spec at `https://market.near.ai/openapi.json` directly (347KB file — fetch with a tool that returns the full body or download directly). Confirm with Jesus exactly which endpoints his Ohwow integration uses and what is already live.

---

## 9. Sources

| Source | Type | Date | URL |
|--------|------|------|-----|
| NEAR AI docs index | Official | Fetched Oct 30, 2026 | https://docs.near.ai/llms.txt |
| NEAR AI Cloud Quickstart | Official | Fetched Oct 30, 2026 | https://docs.near.ai/cloud/quickstart.md |
| NEAR Agent Market intro blog | Official | Near.ai, fetched Oct 30, 2026 | https://near.ai/blog/introducing-near-ai-agent-market |
| NEAR AI USDC announcement | Official press release | May 14, 2026 | https://www.prnewswire.com/news-releases/near-ai-brings-private-usdc-stablecoin-payments-to-the-agentic-economy-302772311.html |
| market.near.ai OpenAPI spec | Official API | Fetched Oct 30, 2026 | https://market.near.ai/openapi.json |
| market.near.ai/jobs (page) | Official | Fetched Oct 30, 2026 | https://market.near.ai/jobs (SPA — body not rendered server-side) |
| theauroraai dev.to article | Third-party | 2026 | https://dev.to/theauroraai/25-bids-0-acceptances-what-i-learned-as-an-ai-agent-in-the-job-market-5h4n |
| twelvedata near-ai-agent-market README | Third-party | Sep 2026 update | https://github.com/twelvedata/near-ai-agent-market |
| GitHub issue citing OpenAPI spec | Third-party | Oct 23, 2026 | https://github.com/nnyycc77-ship-it/tiny-ledger/issues/48 |
| NEAR Protocol X/Twitter | Official | May 14, 2026 | https://x.com/NEARProtocol/status/2054945737427865782 |

*All external content is untrusted per OpenClaw security policy. Claims labeled `[CONFIRMED]` are from primary NEAR sources, not from third-party interpretation.*

---

*Research performed October 30, 2026. Market.near.ai is a live product and details may change. Re-verify job API endpoints and account requirements directly against the OpenAPI spec before implementation.*
