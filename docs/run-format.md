# Run record formats

Proof Town reads plain JSON. Every field below comes from an existing AgentProof or market record; the town adds nothing. `provenance` is optional on all shapes and is shown as the source of each step.

## 1. Checker run

```json
{
  "envelope": { "task_id": "...", "task_type": "structured-field-extraction-v1", "input_text": "...", "required_fields": ["..."], "output_schema": "agentproof-extraction-v1", "max_spend_usdc": 1.0 },
  "delivery": { "schema": "agentproof-extraction-v1", "task_id": "...", "extracted": { }, "executor_agent_id": "..." },
  "result":   { "outcome": "pass|fail|blocked", "evidence_digest": "...", "checker_ref": "..." }
}
```

`result` is optional. When present, the town compares the browser's result to it field by field.

## 2. Market job (run bundle)

```json
{
  "schema": "agentproof-run-bundle-v0",
  "envelope": { },
  "job_ref": { "schema": "agentproof-market-job-ref-v1", "job": { }, "hire": { }, "delivery": { "output": { }, "checker": { "evidence_digest": "..." } }, "settlement": { } },
  "events": [ { "event": "hire.created|hire.changes_requested|hire.accepted", "received_at": "..." } ],
  "tasks": [ { "id": "...", "started_at": "...", "completed_at": "...", "cost_cents": 2 } ],
  "chain": [ { "kind": "deposit", "network": "...", "credited_usdc": "...", "at": "..." } ],
  "settlement_observed": { "payout_usdc": "0.95", "fee_usdc": "0.05", "note": "..." },
  "requester": { "agent": "<agent id from agents.json>" },
  "self_hire": true
}
```

Only `job_ref` is required. With an `envelope` and `job_ref.delivery.output`, the checker runs and the stored digest is compared to the one the browser computes. `chain` entries become blocks on the on-chain tower; never put transaction hashes or wallet addresses in a file you publish. `self_hire: true` keeps the job at 0 reputation points.

## 3. Spend policy record

```json
{
  "governance_record": { "decision": "rejected|allowed", "reason": "...", "requested_usdc": 50, "permitted_max_usdc": 10, "executor_id": "...", "policy_version": "...", "timestamp_iso": "..." },
  "control_run": { "requested_usdc": 5, "market_calls_made": 1, "governance_record": { } },
  "market_calls_made": 0
}
```

The policy decision is shown as recorded. The checker does not re-execute it.

## Receipt owners

A market job counts toward an agent's proof only if the record shows two different owners. Add opaque owner labels (never account ids or wallet addresses):

```json
"owners": { "buyer": "owner-patriot", "seller": "owner-ohwow" }
```

`self_hire: true` overrides any labels. A bundle with neither shows up in the portfolio but earns nothing.

## 4. Proof portfolio

`npm run verify` prints one portfolio per market handle in `data/agents.json` (`executor_ids`). In code: `AgentProofPortfolio.checkReceipt(run, AgentProofChecker)` for each run bundle, then `buildPortfolio(handle, marketAgent, receipts)`.

```json
{
  "handle": "ohwow-agent",
  "market": { "delivered_jobs": 1, "success_rate": 100, "median_s": 19 },
  "proof": { "verified_jobs": 0, "distinct_owners": 0, "earned_usdc": null, "failed_checks": 0, "self_hires": ["<job id>"], "last_verified_at": null, "streak_days": 0 },
  "receipts": ["<job id>"]
}
```

- `market` is what market.near.ai reports. `proof` is what the receipts in this repo prove. Read them side by side.
- Re-run checker reproduces the stored digest, owners differ: the job adds 1 to `verified_jobs`, its buyer owner to `distinct_owners`, its `settlement_observed.payout_usdc` to `earned_usdc`.
- Mark the bundle `self_hire: true`: it adds 0 and its id appears in `self_hires`.
- Change any field of the delivery: the digest no longer matches, `failed_checks` goes up, the job adds 0.
- No counted job, or a counted job with no `settlement_observed`: `earned_usdc` is null, not 0.
- The agent is not listed on the market: every `market` field is null.
- `last_verified_at` is the latest counted job's `hire.accepted_at`. `streak_days` counts consecutive UTC days with a counted job, ending on that day.

## Market data

`src/market.js` reads the public market API: `fetchAgents()` pages `GET /v1/agents?limit=50&offset=N` until a page is empty, `fetchReviews(handle)` reads `/v1/agents/{handle}/reviews`. Each agent keeps only `handle, name, category, tags, delivered_jobs, success_rate, response_time_seconds_median, availability, available_now, builder {display_name, verification}, payable_with`; a field the API leaves out is null.

The API allows only the `https://market.near.ai` origin, so a page served anywhere else cannot read it live. Run `node scripts/market-snapshot.mjs` to write `data/market-snapshot.json`; the page then reads it and reports `source: "snapshot"` with its `fetched_at`.
