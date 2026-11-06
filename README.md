# AgentProof Market Town

A 3D town of every agent listed on market.near.ai. Each building is a real agent: its height is what the market says it delivered. Flip to **Proof view** and the town tells the other story: only jobs backed by a receipt your browser re-checks stay standing. On the 2026-11-03 snapshot the market reports 507 delivered jobs across 560 agents (450 have none), and exactly 1 job is proven between two different owners (CEOClaw hired ohwow-agent).

The older guided replay (`replay.html`) walks one record at a time through six stations: request, policy, AI work, verify, settle, reputation. It is kept as is.

## Run it

No build step and no dependencies. three.js 0.160.0 ships in `vendor/three` (MIT), so the town needs no CDN; only web fonts load from the network and they fall back.

- Run `npm run dev` and open `http://127.0.0.1:8787`: the town draws at once from `data/market-snapshot.json`, labelled "snapshot from <time>". There is no Connect button.
- Also run `npm run relay` (any order, any time): the page finds the relay in the background, swaps in the live list without a reload and the header says "live via relay" only once real data has arrived. It refreshes every 60 s. If the relay stops, the town keeps its data and says "live paused, showing data from HH:MM UTC" (amber, not an error) and keeps retrying, so a restarted relay is picked up again.
- The relay listens on 127.0.0.1:8788. If that port is taken it says so and tries 8789, then 8790; if all three are taken it prints what to do and exits. `GET /health` answers without touching the market. The page probes all three ports; `?relay=http://host:port` points it at another relay and `?relay=off` skips it. With no relay running, the browser console shows refused-connection lines from that probe: they are expected, not errors in the page.
- **Market view / Proof view** (header switch): market view is delivered jobs as the market reports them; proof view is proof-backed jobs. Flipping sinks everything without a counted receipt, the proven building stays and glows, and the header counter runs between the two totals. With reduced motion on it swaps at once.
- **Find an agent** (header search): type any handle or name, fuzzy matching works ("wbrsrch" finds web-research). The camera flies there and the card opens, first with what the market says, then flipping to what is proven. **Save image** downloads the card as a PNG, **Copy link** copies `portfolio.html#<handle>`. An agent with no proof says what it would take to get one.
- **How this works**: four short steps for newcomers (the market, the problem, the proof, why owners matter), each tied to the map. Step 3 re-runs the checker in your browser and shows the stored and recomputed fingerprints side by side. A first visit shows a skippable hint; `?teach=0` hides it, `?teach=1` shows it again. Underlined terms (seal, proof-backed, cross-owner, self-hire, escrow, digest) explain themselves on hover or tap.
- **Data**: an analysis panel computed from whatever the town is showing, snapshot or live, and every chart says which: delivered jobs per agent (log bins, the long tail), the share with zero, delivered vs proven per category, success rate vs delivered (100% on 1 job means little), median response time by category, availability now, and the receipts table (buyer, seller, owners, price, verdict, digest stored vs recomputed).
- A ticker shows real changes between refreshes (new agent, delivered count up, availability changed) and the changed buildings pulse. Lit windows breathe. Sound is off until you turn it on.
- Drop or paste a run JSON anywhere on the town: it is re-checked, added and played. Hover a building for its numbers, click it for its card (a bottom sheet on a phone).
- The receipts play by themselves once the town is up: the camera eases to each one (the cross-owner receipt first), the buyer's building pulses on its blue plinth, an arc draws from buyer to seller, a tag says "re-checking..." and then the seal your browser just recomputed. The self-hire beat says "checker passed" and, apart, "earns 0 reputation: same owner". Press **Replay receipts** to run it again; touching the town stops it.
- `?demo=1`: the same run paced for a ~30 s recording with the controls hidden. `?theme=dark` switches to the dark tokens.

Districts are market categories, one hue each. A zero-job agent is a low plinth. Lit windows mean `available_now`. A gold seal on a roof means at least one proof-backed receipt. Arcs: green is verified between two different owners, pink round a building is a self-hire (0 points), red is a failed check. The buyer of a receipt is the owner in `run.requester.agent`: its building is one of its `executor_ids` when listed, else the market listing whose builder display name matches that owner (CEOClaw's is `ceoclaw-web`). A buyer with no listing at all is drawn as a labelled "off-market buyer" marker west of the town.

## Judge path

1. `npm run verify`: it re-runs the checker on every run file and prints, for ohwow-agent, `market delivered N ... proof verified_jobs 1, distinct_owners 1 ... self_hires 1`.
2. Open the town, flip to **Proof view**: the one building left standing is ohwow-agent, with its seal. Its card says proven 1, plus 1 self-hire at 0 points. Those are the same numbers, computed by the same `src/checker.js` and `src/portfolio.js`, in your browser.
3. `node scripts/check-analysis.mjs`: it recomputes the Data panel's headline numbers from the snapshot (560 agents, 507 delivered, 450 with zero, 288 available, 1 proven) and prints the exact strings the panel shows.
4. `npm test`: relay and market client tests (parallel pages, retries, port walk, diff).

## Proof portfolio and embed

- Open `http://127.0.0.1:8787/portfolio.html#ohwow-agent`: see the agent's card. The big number is proof-backed jobs (1 here: CEOClaw, a different owner, hired it; its other receipt is a self-hire and counts 0), next to what the market says. The tick means every receipt was re-checked in your browser and its digest reproduced.
- Change the hash to any market handle (`#web-research`), or search in **Any market agent**: see that agent's card. Most show 0 proof, their real market numbers and what it would take to get a proof-backed job.
- Press **Save image**: get a PNG of the card. **Copy link** copies the `#handle` link.
- Open `portfolio.html?receipts=<url>` with an edited run bundle: see the red "receipt failed check" state.
- Open `http://127.0.0.1:8787/embed.html`: see a mock agent list with an `<agentproof-badge>` on each row and the full `<agentproof-portfolio>` card, plus the one script tag to copy. Theme tokens (`--ap-bg`, `--ap-paper`, `--ap-ink`, `--ap-muted`, `--ap-line`, `--ap-proof`, `--ap-market`, `--ap-warn`, `--ap-void`, `--ap-display`, `--ap-body`, `--ap-mono`) are listed at the top of `src/components.js`.

## Test it with real data

```
npm run verify                                   # re-check every run in data/manifest.json
node scripts/verify-runs.mjs path/to/record.json # re-check one file
```

To replay a record you have:

- drop or paste the JSON file on the town page (`index.html`), or
- on `replay.html`, drop it or open the menu, choose **Add your own proof**, and paste it, or
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
| `runs/market-2d17e4c8.json` | The first cross-owner receipt: CEOClaw hired ohwow-agent on market.near.ai, checker pass, digest reproduced. Two different owners, so it counts as 1 proof-backed job. | market.near.ai job, 2026-11-03 |
| `runs/market-b68f5497.json` | A real $1 job on market.near.ai: hire, AI work, one change request, checker pass, accept, 0.95 USDC payout. Buyer and seller share an owner, so it earns no reputation. | ohwow.fun production records, 2026-11-03 |
| `runs/fixture-wrong-delivery.json` | CEOClaw's deliberately wrong delivery, caught at step 5 | `task-002` fixtures |
| `runs/checker-blocked-budget.json` | ohwow refuses a job over the buyer's $0.25 cap; the browser result equals the committed result | `task-004` checker run |
| `runs/policy-scenario-c.json` | ohwow's owner cap stops a $50 spend before any market call; a $5 control run passes | `task-008` scenario C |

## Agent look

Each owner sets one color and a logo for their agent in `data/agents.json` (`color`, `logo` as a path under `data/`). The **Customize agents** panel on `replay.html` previews changes.

## Files

```
index.html            Market Town page shell and styles
src/app.js            Market Town: districts, buildings, proof lens, search, receipts, live refresh, ticker
src/analysis.js       the Data panel: stats (also runs in Node) and SVG charts
src/teach.js          How this works walkthrough, first-visit hint, glossary tooltips
replay.html           the older guided replay page
src/replay.js         the guided replay: scene, robots, stations
scripts/relay.mjs     local read-only relay for market.near.ai (npm run relay)
src/checker.js        line-for-line JS port of task-002/checker.py (also runs in Node)
src/market.js         read-only client for market.near.ai (snapshot, relay discovery, parallel pages, diff)
src/portfolio.js      proof portfolio: market numbers next to proof-backed numbers
src/components.js     <agentproof-portfolio> and <agentproof-badge> web components
portfolio.html        shareable card page, #<handle>
embed.html            how a host app embeds the components
data/agents.json      the cast
data/manifest.json    which runs load, in order
data/runs/*.json      the records
data/market-snapshot.json  market agents for pages outside market.near.ai (CORS)
scripts/verify-runs.mjs
scripts/check-analysis.mjs  recomputes the Data panel numbers from the snapshot
scripts/test-market.mjs     relay + market client tests (npm test)
scripts/market-snapshot.mjs
scripts/export-ohwow-market-job.sh
LICENSE               MIT
```
