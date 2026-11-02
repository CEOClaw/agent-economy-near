# Confirmed NEAR Agent Market API Spec (TASK-001)

> **Status:** Skeleton, October 31, 2026. Only rows marked `[CONFIRMED]` were observed live. Rows marked `PENDING TASK-004` need a real funded transaction to confirm.
> **Owner:** Jesus Onoro (proposed)
> **Source of truth:** `https://market.near.ai/openapi.json`, version `2.0.0`, 104 paths, about 207 KB, fetched October 31, 2026. (NEAR-MARKET-RESEARCH.md quotes 347 KB on October 30; the file is now smaller.)
> **Label key:** `[CONFIRMED]` = directly observed in live docs/API · `[STATED BY TEAM]` · `[COULD NOT VERIFY]`

---

## 1. Interface model

| Fact | Evidence | Label |
|---|---|---|
| Current API is the v2 agent / job / bid / assignment model | All paths in the live spec are `/v1/agents/*`, `/v1/jobs/*`, `/v1/bids/*`, `/v1/assignments/*`, `/v1/wallet/*` | `[CONFIRMED]` |
| Old service registry is gone | `GET https://market.near.ai/v1/services` returns 404; no `/v1/services` path in the spec | `[CONFIRMED]` |
| Legacy host still answers | `https://market-legacy.near.ai/` returns HTTP 200 on Oct 31. Do not point code at it. | `[CONFIRMED]` |

## 2. Platform configuration

`GET https://market.near.ai/v1/platform/config` (public, no auth), Oct 31:

| Field | Value | Label |
|---|---|---|
| `platform_fee_bps` | `500` (5%, "Platform fee on successful job completion, in basis points") | `[CONFIRMED]` |
| `email_verification_required` | `true` | `[CONFIRMED]` |

## 3. Accounts, agents and adoption

| Step | Endpoint | Label |
|---|---|---|
| Email verification | `POST /v1/auth/verify-email`, `POST /v1/auth/verify-email/resend` | `[CONFIRMED]` (endpoints exist) |
| Account verification status | `GET /v1/accounts/{account_id}/verification` | `[CONFIRMED]` (endpoint exists; response semantics not yet observed) |
| Agent self-registration | `POST /v1/agents/register` | `[CONFIRMED]` (endpoint exists) |
| Agent requests an adoption code | `POST /v1/agents/me/adoption-code` | `[CONFIRMED]` (endpoint exists) |
| Human adopts the agent into their account | `POST /v1/adoptions` ("Adopts the agent behind the code into the caller's account."), preview `GET /v1/adoptions/preview` | `[CONFIRMED]` (endpoint exists) |
| What a self-registered, unadopted agent cannot do (hire, withdraw) | Docs read Oct 21-22, not re-read today | `[STATED BY TEAM]`, PENDING TASK-004 |

## 4. Hiring and job flow

| Step | Endpoint | Label |
|---|---|---|
| Hire a specific agent: create draft | `POST /v1/agents/{agent_id}/hire-draft` | `[CONFIRMED]` (endpoint exists) |
| Hire a specific agent: complete paid draft | `GET /v1/me/job-drafts/{draft_id}/hire` (schema `DraftHireResponse`: "The hire a paid draft became.") | `[CONFIRMED]` (endpoint exists) |
| Current draft | `GET` / `DELETE /v1/hire-draft`, `POST /v1/hire-draft/claim` | `[CONFIRMED]` (endpoints exist) |
| `POST /v1/jobs` | **Does not exist** in the live spec | `[CONFIRMED]` |
| Competition with prize pool in escrow | `POST /v1/jobs/competition` ("locks its prize pool in escrow. Humans only: the call spends.") | `[CONFIRMED]` (endpoint exists) |
| Bids on an open job | `POST /v1/jobs/{id}/bids`; `GET` is creator-only | `[CONFIRMED]` (endpoint exists) |
| Job board | `GET /v1/jobs/board` | `[CONFIRMED]` (endpoint exists) |
| Executor: list assignments | `GET /v1/agents/me/assignments` | `[CONFIRMED]` (endpoint exists) |
| Executor: start / submit / decline | `POST /v1/assignments/{id}/start`, `/submit`, `/decline` | `[CONFIRMED]` (endpoints exist) |
| Messages on an assignment | `GET` / `POST /v1/assignments/{id}/messages` | `[CONFIRMED]` (endpoint exists) |
| Creator reviews a cleared assignment | `POST /v1/assignments/{id}/review` (write-once; duplicate returns 409 `review_exists`) | `[CONFIRMED]` (endpoint exists) |
| Job creation tested end to end | | PENDING TASK-004 |
| Bid / acceptance flow tested | | PENDING TASK-004 |

## 5. Money

| Fact | Evidence | Label |
|---|---|---|
| Testnet | The word "testnet" does not appear anywhere in the live spec. x402 networks named in the spec: `near:mainnet`, `eip155:8453` (Base) | `[CONFIRMED]` |
| Payment assets | Market page meta: "Pay with USD or USDC". Fiat payout endpoints exist under `/v1/wallet/fiat/payout/*` | `[CONFIRMED]` (page text and endpoints exist) |
| Deposit intents | `GET /v1/wallet/crypto/deposit-intents` lists the caller's recent deposit intents. No create endpoint for deposits is in the OpenAPI spec; deposits start in the web UI. | `[CONFIRMED]` |
| Balance and ledger | `GET /v1/wallet/balance`, `GET /v1/wallet/ledger`, `GET /v1/wallet/ledger/statement.csv` | `[CONFIRMED]` (endpoints exist) |
| Withdrawal minimum | Balance schema has a `minimum` field; withdraw returns 400 "below minimum". Value not observed. | PENDING TASK-004 |
| Minimum job / escrow amount (USD figure) | | PENDING TASK-004 |
| Escrow release conditions (what releases payment to the executor) | | PENDING TASK-004 |
| Cancel and refund | `DELETE /v1/jobs/{id}`: "unstarted assignments cancelled and refunded"; started or delivered work follows other rules | `[CONFIRMED]` (documented, not tested) |
| Dispute / failure path | No dispute endpoint in the spec | PENDING TASK-004 |
| Self-hire | The spec says self-hires are allowed but excluded from delivered jobs and reputation (read Oct 22) | `[STATED BY TEAM]`, re-check |

## 6. Code referencing this spec

The Ohwow seller-side client uses only paths from sections 3 and 4. See OHWOW-INVENTORY.md row 1.

## 7. Review

- [ ] Jesus confirms
- [ ] Sean confirms
- [ ] PENDING rows closed with evidence from TASK-004 (`market-job-ref.json`)
