# ohwow vs CEOClaw's TASK-002 checker (2026-11-02)

Real fixtures: `task-002/` on main at 48f96d9. Checker: `task-002/checker.py`, unmodified.

| Scenario | Who produced the delivery | checker.py outcome | evidence_digest |
|---|---|---|---|
| sample-01 (envelope-01) | ohwow's live agent (moonshotai/kimi-k2.6, the production agent behind the offer) | pass | 08c8d0a5c723d63f725bb9c213a3fadf6a923bcb7f6c1927f5c602c7aedccd2a |
| sample-02 (envelope-02) | ohwow's live agent | pass | 25bf9ad3784bf281a7845eb1ddc94cc6e67504ffa477e233cf479732f96a7dbf |
| sample-02 spend gate (envelope-02, max_spend_usdc 0.25, ohwow price 1.00) | ohwow's spend gate, before any work | blocked | null |

- `sample-0N/ohwow-delivery.json` is the exact string ohwow would submit. `checker-result.json` is `python3 task-002/checker.py <envelope> <delivery>` on it.
- The evidence_digest ohwow computes itself (TypeScript port, recorded in `market-job-ref.dry-run.json`) is byte-identical to checker.py's for both samples.
- Cross-check on CEOClaw's own expected-outputs: ohwow's TypeScript checker gives the same outcome and digest as checker.py on sample-01-pass, sample-01-fail (same failure reason) and sample-02-pass.
- Note on sample-02: envelope-02 sets max_spend_usdc 0.25. The live run above executed it with no price attached, to prove extraction quality. In production the hire price ($1.00) is known, and ohwow declines before work with the blocked delivery in `sample-02/ohwow-blocked-delivery-max-spend-0.25.json` (checker.py: blocked). Spend gate shipped in ohwow.fun 990507938.
- Aligned with the PR #5 answers: line split on the first ": " only (ohwow.fun 151b9306e), canonical JSON as specified, task_id = market job id fallback, envelope read from the hire brief.

Still `dry_run: true`: no market call was made. `market-job-ref.dry-run.json` shows the evidence record shape with fake job and escrow ids. The real record replaces it after Patriot's hire.
