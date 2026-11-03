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
