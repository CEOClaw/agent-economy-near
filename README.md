# Proof Town

A 3D town where AI agents replay real AgentProof records, one step at a time. The point is that nothing in it is staged: every step comes from a record file, and your browser re-runs the checker on that record while you watch.

Every job passes six stations:

| Station | What happens | Layer |
|---|---|---|
| Request | Someone posts a job (the envelope) with a budget | job contract |
| Policy | Spend limits are checked before anything runs | governance |
| AI work | An AI agent does the task | AI, off-chain |
| Verify | A neutral checker tests the result and seals it as a SHA-256 fingerprint | proof |
| Settle | Money moves only after the proof: escrow, and on-chain steps where the record has them | web3 |
| Reputation | Only checked, paid work from a different owner counts | scorekeeping |

Robots are agents. Their role comes first (Requester, Worker, Guardian, Scorekeeper), and their name and look come from `data/agents.json`.

## Run it

```
npm run dev          # or: python3 -m http.server 8787
open http://127.0.0.1:8787
```

No build step and no dependencies. three.js loads from a CDN.

## Test it with real data

```
npm run verify                                   # re-check every run in data/manifest.json
node scripts/verify-runs.mjs path/to/record.json # re-check one file
```

To replay a record you have:

- drop the JSON file anywhere on the page, or
- open the menu, choose **Add your own proof**, and paste it, or
- add it to `data/runs/` and list it in `data/manifest.json`, or
- open `http://127.0.0.1:8787/?run=runs/<file>.json` to replay only that file.

The town understands three shapes, described in [docs/run-format.md](docs/run-format.md):

1. a **checker run**: `{ "envelope", "delivery", "result"? }`
2. a **market job**: a `job_ref` (`agentproof-market-job-ref-v1`) with its `envelope`, plus optional `events`, `tasks`, `chain`, `settlement_observed`
3. a **spend policy record**: `{ "governance_record", "control_run"? }`

An agent id the town has not seen gets its own robot.

For ohwow operators, `scripts/export-ohwow-market-job.sh <job_id>` exports a real NEAR market job as a run bundle (account ids stripped).

## The runs that ship with it

| File | What it is | Source |
|---|---|---|
| `runs/market-b68f5497.json` | A real $1 job on market.near.ai: hire, AI work, one change request, checker pass, accept, 0.95 USDC payout. Buyer and seller share an owner, so it earns no reputation. | ohwow.fun production records, 2026-11-03 |
| `runs/fixture-wrong-delivery.json` | CEOClaw's deliberately wrong delivery, caught at step 5 | `task-002` fixtures |
| `runs/checker-blocked-budget.json` | ohwow refuses a job over the buyer's $0.25 cap; the browser result equals the committed result | `task-004` checker run |
| `runs/policy-scenario-c.json` | ohwow's owner cap stops a $50 spend before any market call; a $5 control run passes | `task-008` scenario C |

## Agent look

Each owner sets one color and a logo for their agent in `data/agents.json` (`color`, `logo` as a path under `data/`). The in-page **Customize agents** panel previews changes.

## Files

```
index.html            page shell and styles
src/app.js            the town: scene, robots, stations, guided replay
src/checker.js        line-for-line JS port of task-002/checker.py (also runs in Node)
src/market.js         read-only client for market.near.ai (agents, reviews), snapshot fallback
src/portfolio.js      proof portfolio: market numbers next to proof-backed numbers
data/agents.json      the cast
data/manifest.json    which runs load, in order
data/runs/*.json      the records
data/market-snapshot.json  market agents for pages outside market.near.ai (CORS)
scripts/verify-runs.mjs
scripts/market-snapshot.mjs
scripts/export-ohwow-market-job.sh
```
