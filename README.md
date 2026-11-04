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

No build step and no dependencies. three.js loads from a CDN.

- Run `npm run relay` in one terminal and `npm run dev` in another, then open `http://127.0.0.1:8787`: the town starts empty, connects by itself after a second, and fills with every market.near.ai agent. The header says "live via relay" and refreshes itself every 60 s.
- Run only `npm run dev` and open the same address: see an empty town and one button. Press **Connect market.near.ai**: the town fills from `data/market-snapshot.json` and the header says "snapshot from <time>" (that is the CORS fallback, a real capture, labelled as one).
- Open `?relay=http://host:port` to point the town at another relay, or `?relay=off` to skip the relay.
- Hover a building: see the agent's name, category, delivered jobs and success rate. Click it: see its proof portfolio in a side panel (a bottom sheet on a phone). Type a handle in the search box: the camera flies to it.
- Open `http://127.0.0.1:8787/replay.html`: see the old guided replay of the four real records.
- Wait for the town to rise: the receipts play by themselves. The camera eases to each one (the cross-owner receipt first), the buyer's building pulses, an arc draws from buyer to seller, a tag says "re-checking..." and then the seal your browser just recomputed ("seal 89c9b813 matches"), and the seller's card opens. Then the camera returns to the overview. Press **Replay receipts** to run it again. Touching the town stops it and shows every receipt at once. With reduced motion on, the camera stays put and only the highlights change.
- Open `?demo=1`: the same run paced for a ~30 s recording, with no search or controls, ending on the overview with the card open. `?theme=dark` switches to the dark tokens (light is the default).

Buildings are agents, one district (and one hue) per market category, height is delivered jobs on a log scale, and a zero-job agent is a low plinth. Lit windows mean `available_now` (a plinth gets a small roof light instead). A gold seal on a roof means at least one proof-backed receipt. Arcs: green is verified between two different owners, pink dashes round a building are a self-hire (0 points), red is a failed check. The buyer of a receipt is the owner in `run.requester.agent`: its building is one of its `executor_ids` when listed, else the market listing whose builder display name matches that owner (CEOClaw's is `ceoclaw-web`). A buyer with no listing at all is drawn as a labelled "off-market buyer" marker west of the town. The relay (`scripts/relay.mjs`) is a read-only local proxy of the public agent list; it only listens on 127.0.0.1 and is not hosted anywhere.

## Proof portfolio and embed

- Open `http://127.0.0.1:8787/portfolio.html#ohwow-agent`: see the agent's card. The big number is proof-backed jobs (0 here, its one receipt is a self-hire), next to what the market says (1 delivered, 100% success). The tick means every receipt was re-checked in your browser and its digest reproduced.
- Change the hash to any market handle (`#web-research`), or search in **Any market agent**: see that agent's card. Most show 0 proof and their real market numbers.
- Press **Save image**: get a PNG of the card. **Copy link** copies the `#handle` link.
- Open `portfolio.html?receipts=<url>` with an edited run bundle: see the red "receipt failed check" state.
- Open `http://127.0.0.1:8787/embed.html`: see a mock agent list with an `<agentproof-badge>` on each row and the full `<agentproof-portfolio>` card, plus the one script tag to copy. Theme tokens (`--ap-bg`, `--ap-paper`, `--ap-ink`, `--ap-muted`, `--ap-line`, `--ap-proof`, `--ap-market`, `--ap-warn`, `--ap-void`, `--ap-display`, `--ap-body`, `--ap-mono`) are listed at the top of `src/components.js`.

## Test it with real data

```
npm run verify                                   # re-check every run in data/manifest.json
node scripts/verify-runs.mjs path/to/record.json # re-check one file
```

To replay a record you have:

- drop the JSON file anywhere on the page, or
- open the menu, choose **Add your own proof**, and paste it, or
- add it to `data/runs/` and list it in `data/manifest.json`, or
- open `http://127.0.0.1:8787/replay.html?run=runs/<file>.json` to replay only that file.

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
index.html            Market Town page shell and styles
src/app.js            Market Town: districts, buildings, receipts, panel, auto-refresh
replay.html           the guided replay page
src/replay.js         the guided replay: scene, robots, stations
scripts/relay.mjs     local read-only relay for market.near.ai (npm run relay)
src/checker.js        line-for-line JS port of task-002/checker.py (also runs in Node)
src/market.js         read-only client for market.near.ai (relay, then snapshot)
src/portfolio.js      proof portfolio: market numbers next to proof-backed numbers
src/components.js     <agentproof-portfolio> and <agentproof-badge> web components
portfolio.html        shareable card page, #<handle>
embed.html            how a host app embeds the components
data/agents.json      the cast
data/manifest.json    which runs load, in order
data/runs/*.json      the records
data/market-snapshot.json  market agents for pages outside market.near.ai (CORS)
scripts/verify-runs.mjs
scripts/market-snapshot.mjs
scripts/export-ohwow-market-job.sh
```
