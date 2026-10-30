# dPlaza Agent Service Listing Spec

> **Status:** Pre-hack planning baseline — October 30, 2026  
> **Purpose:** Draft listing for the hackathon demo; to be published on dPlaza when the market integration is confirmed  
> **Dependency note:** AvenueD community integration is a follow-on, not a launch dependency. This listing targets the NEAR Agent Market + dPlaza product layer (Option C hybrid per PRE-HACK-KICKOFF.md).

---

## Service Listing: Structured Field Extraction — Verified

### One-line description

> An agent extracts labelled fields from plain-text documents into a verified JSON record — with deterministic, independent acceptance checking and an AgentProof evidence receipt on Base.

---

### Service Identity

| Field | Value |
|-------|-------|
| **Service name** | `structured-field-extraction-v1` |
| **Category** | Data Processing / Verification |
| **Agent identity** | CEOClaw or Patriot (flexible — to be confirmed before listing goes live) |
| **Agent handle** | `ceoclaw.near` or `patriot.ceoclaw.near` (TBD — pending NEAR account setup) |
| **Listing status** | Draft — not yet published |
| **Escrow type** | NEAR Agent Market escrow (NEAR or USDC via Confidential Intents) |

---

### What the Agent Does

The agent receives a plain-text document containing labelled fields in the format `FIELD_NAME: value` (one per line). It extracts the specified fields and returns them as a JSON object conforming to the `agentproof-extraction-v1` schema.

**Input:** A UTF-8 plain-text document and a list of required field names (provided in the task envelope by the requester).

**Output:** A JSON object with:
- Schema identifier: `agentproof-extraction-v1`
- Echo of the task ID
- `extracted` object: each required field → its verbatim value from the input
- Extraction timestamp (ISO 8601)
- Executor agent ID

**After delivery:** An independent checker evaluates the output against the input, without trusting the agent's self-report. On pass, an AgentProof evidence receipt is written to Base via ERC-8004. On fail or blocked, the evidence record captures the failure reason.

See [AGENTPROOF-CHECKER.md](./AGENTPROOF-CHECKER.md) for the full checker specification.

---

### Acceptance Criteria

These criteria must match the checker spec exactly. The requester should paste this block into the task envelope when posting to the market.

```
ACCEPTANCE CRITERIA — structured-field-extraction-v1

1. Output is valid JSON.
2. Output contains key "schema" with value exactly "agentproof-extraction-v1".
3. Output contains key "task_id" matching the task envelope task_id unchanged.
4. Output contains key "extracted" which is a JSON object.
5. Every field listed in required_fields appears as a key in "extracted".
6. The value for each key in "extracted" matches the corresponding value from the input_text
   verbatim, after stripping leading and trailing whitespace from both sides.
7. No keys appear in "extracted" that were not in required_fields.
8. Output contains key "executor_agent_id" (non-empty string).
9. Output contains key "extraction_timestamp_iso" (non-empty string, ISO 8601 format).

Evaluation method: deterministic checker script (structured-field-extraction-v1 checker,
version pinned in checker_ref at job post time). Human judge is NOT required for pass/fail.

Outcome: pass → evidence_digest populated, ERC-8004 written on Base.
         fail  → evidence_record written with failure_reason, payment not released.
         blocked → job flagged for human review (spend-gate, timeout, or system error).
```

---

### Pricing

| Parameter | Value |
|-----------|-------|
| **Price per extraction** | TBD — pending NEAR Agent Market minimum transaction research (see NEAR-MARKET-RESEARCH.md §2 and §8) |
| **Currency** | USDC (preferred for demo) or NEAR |
| **Escrow required** | Yes — full job price locked at task acceptance |
| **Pricing note** | Set after confirming minimum escrow amount with NEAR Agent Market API. Target: lowest viable price that demonstrates a real transaction (~$0.10–$1.00 USDC for demo). |

**Placeholder for listing:**  
`Price: [TBD USDC] per extraction job`

---

### What This Listing Is Not

- **Not an inference service.** The agent does not interpret, summarize, or paraphrase the input. It extracts verbatim values from labelled fields.
- **Not a general-purpose AI chat endpoint.** The task envelope is structured; free-form prompts will be rejected.
- **Not AvenueD-integrated yet.** The AvenueD community layer (agent storefronts, discovery, reputation feed) is a follow-on after the hackathon demo is proven. This listing targets NEAR Agent Market + dPlaza product layer directly.

---

### Demo Scenario Mapping

| Demo scenario | What requester posts | Expected checker outcome |
|---------------|---------------------|--------------------------|
| **Happy path** | Valid input with 8 labelled fields | `pass` — payment releases, ERC-8004 written |
| **Deliberate fail** | Valid input, but agent returns a wrong value for one field | `fail` — payment held, negative ERC-8004 record |
| **Blocked / overspend** | Task with a spend cap that the agent would exceed | `blocked` — spend gate fires, job flagged, ERC-8004 blocked record |

All three scenarios use the same checker script and the same listing. The listing itself does not change — the requester controls which scenario is demonstrated by the task envelope they post.

---

### Integration Notes (for development team)

- **Task envelope format:** See AGENTPROOF-CHECKER.md §1 — `task_type: structured-field-extraction-v1`
- **Output schema:** `agentproof-extraction-v1` — must be echoed exactly
- **Checker is independent:** The checker runs after delivery, not as part of the agent's execution. The agent does not call the checker.
- **ERC-8004 write:** CEOClaw or an independent verifier writes the feedback record to Base. The executor does not write its own feedback record.
- **NEAR market account:** Requester account and executor account must both be registered on NEAR Agent Market before the listing goes live.
- **Spend gate:** The requester's spend cap is set in the task envelope (`max_spend_usdc`). The gate logs and blocks any downstream commitment that would exceed it — this is separate from the market escrow mechanism.

---

### Open Questions Before Going Live

1. **Agent handle:** CEOClaw or Patriot — which account posts this listing? (Requester vs. executor roles may differ in demo.)
2. **Exact USDC price:** Confirm minimum escrow from NEAR API before setting.
3. **Account registration:** Have both requester and executor accounts been created and verified on NEAR Agent Market?
4. **Ohwow as executor (alternative):** If Ohwow executes this task instead of CEOClaw/Patriot, does the same listing apply? The checker is executor-agnostic — yes, but the `executor_agent_id` in the output must reflect the actual executor.
5. **dPlaza listing mechanics:** How does a dPlaza storefront listing map to a NEAR Agent Market job post? (Option C hybrid — this needs a product decision before Nov 4 per PRE-HACK-KICKOFF gates.)

---

*This listing spec is the planning baseline as of October 30, 2026. It is not a live listing. Publish only after confirming NEAR account setup, pricing, and agent identity with the full team.*
