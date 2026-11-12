# AgentProof red team: checker.py

`node viz/redteam.mjs` sends 32 deliveries to `task-002/checker.py` (unmodified, main 48f96d9) on envelope-01. 27 are attacks: wrong work dressed up to get paid. 5 are correct work in an unusual form, which should pass. Each one also runs through `viz/checker.js`, and the two agree on every case that can be expressed as a JS object. The results are in `redteam-results.json`.

**Result: 27 of 27 attacks refused. 5 of 5 correct-work variants passed.**

| Category | Attacks | Refused |
|---|---|---|
| Wrong value (one character, case, rounding) | 4 | 4 |
| Type confusion (number, null, object, boolean) | 4 | 4 |
| Lookalikes (Cyrillic homoglyph, zero-width space, fullwidth digits, padded key) | 4 | 4 |
| Shape (missing field, empty, list, missing schema) | 6 | 6 |
| Injection (approval note as an extra field, instruction inside a value) | 2 | 2 |
| Replay (another task's correct work, swapped or missing task_id) | 3 | 3 |
| Spend (over-cap price as a number and as a string) | 2 | 2 (blocked) |
| Gate skip (`"blocked": "true"` as a string) | 1 | 1 |
| Duplicate JSON key (wrong value parsed last) | 1 | 1 |

A worker that writes `"outcome": "pass"` and a fake digest into its own delivery is ignored. The checker computes the outcome itself, so this counts as correct work and passes on the real answers only.

## Findings for TASK-005 (none lets wrong work get paid)

1. **The checker does not authenticate the worker.** `executor_agent_id` is self-reported. Correct work signed `someone-else` passes, with a seal that names someone-else. Correct work with no executor id at all also passes, with a seal over an empty id. Binding the id to the market assignment (who was actually hired) has to happen outside the checker, in TASK-005. A cheap fix inside the checker: fail when `executor_agent_id` is missing or empty.
2. **The same correct answer can produce two seals.** Field values are compared after `strip()`, but the digest hashes the raw `extracted` object. `"  Ohwow-Executor-01  "` passes, with a different digest from the clean answer. If the digest is meant to identify the answer, hash the stripped values (this is a spec change, so the checker version would be bumped).
3. **Field order does not change the seal.** Canonical JSON sorts keys, so reordered fields give the identical digest. This works as intended.
