# AgentProof Market Town

> Patent pending: a US provisional application covering this work has been filed. The MIT license covers only the code described in LICENSE; Check Packs are excluded and all rights in them are reserved.

**The idea: check the work before you pay.** Before a buyer accepts a job on NEAR Agent Market, a separate checker runs the delivery against the brief and writes a checklist: one line per field of the brief, ok or FAIL, and a recommendation (pass means accept, fail means send it back, blocked means nothing). That checklist and recommendation are written to a NEAR testnet contract first. Then the buyer decides, by hand, on market.near.ai. The checker recommends and never decides: no code in this repo accepts, sends back or cancels a job, and `scripts/gate.mjs --execute` never touches the market. Later `--confirm` reads (read-only) what the buyer did. What is enforced: the contract refuses to record an accept unless the verdict is pass. The market itself does not read the contract. A job counts as **checked before paid** only if the passing check was on chain before the buyer accepted. When the buyer goes against the recommendation (accepted although the check failed, sent back although it passed) the town shows it and never counts it.

**Where it stands, said plainly.** The checklist logic, the contract code and the dry run all work and are tested offline. The contract that records checks is deployed on NEAR testnet (`agentproof-town.testnet`, deploy tx [4qXpVK9Q...](https://testnet.nearblocks.io/txns/4qXpVK9QKPJzPUkUQB6g9QhjPPJzFdegNd8QGaLTgJbi), 2026-11-11), and **2 jobs are checked before paid**, both hired by ohwow for 0.50 USDC from a seller with a different owner. `8a20efe5`, Alex Pavliuk's `web-page-extractor`: the check passed and was recorded on chain at block 277282896 (2026-11-11 23:30:02.755 UTC, tx [SjL5D7nm...](https://testnet.nearblocks.io/txns/SjL5D7nmgphzPrzrJFKF47nidjZmCYJyVxVfn5VUFGe)), and the buyer accepted by hand on the market 158.9 s later (23:32:41.618 UTC). `34d0f7a5`, Citrus Coast AI's `citrus-extract`: the first delivery was a refusal ("No URL was found in the hire brief"), the checker failed it (not JSON, so there was nothing to record on chain) and the buyer sent it back by hand. The redelivery passed all 9 lines, the check was recorded at block 277285351 (2026-11-11 23:54:31.298 UTC, tx [9EBhyxkb...](https://testnet.nearblocks.io/txns/9EBhyxkbRFKsmJFEM2mEM1Wox8drkogyUUf9VsZUjh9p)), and the buyer accepted by hand 614.7 s later (2026-11-12 00:04:46.010 UTC). That is the helper doing its job: the bad delivery went back, the good one was paid. The other job that re-checks across two owners, `2d17e4c8` (CEOClaw hired ohwow-agent), was paid on 2026-11-04, before any check. It stays a proven receipt and is never shown as checked before paid. A third hire (kordaix-research, job 11ff0a91, Nov 12) was never started by the seller before its deadline, so there was no delivery to check; it is not counted.

A 3D town of every agent listed on market.near.ai. Each building is a real agent: its height is the number of delivered jobs the market reports for it. Flip to **Proof view** and the town adds a second layer: only jobs checked before paid stay standing, and today two do: `web-page-extractor` and `citrus-extract`. On the 2026-11-06 snapshot the market reports 532 delivered jobs across 631 agents (511 have none), and 2 were checked before the buyer paid (hires of 2026-11-11, after the snapshot, so the 532 does not include them). Three jobs re-check between two different owners: those two, and `2d17e4c8`, which was paid before any check.

The older guided replay (`replay.html`) walks one record at a time through six stations: request, policy, AI work, verify, settle, reputation. It is kept as is.

## Run it

No build step and no dependencies. three.js 0.160.0 ships in `vendor/three` (MIT), so the town needs no CDN; only web fonts load from the network and they fall back.

- Run `npm run dev` and open `http://127.0.0.1:8787`: the town draws at once from `data/market-snapshot.json`, and the dot next to the title is labelled "snapshot from <time>" (hover or focus it). There is no Connect button.
- Also run `npm run relay` (any order, any time): the page finds the relay in the background, swaps in the live list without a reload and the header says "live via relay" only once real data has arrived. It refreshes every 60 s. If the relay stops, the town keeps its data and says "live paused, showing data from HH:MM UTC" (amber, not an error) and keeps retrying, so a restarted relay is picked up again.
- The relay listens on 127.0.0.1:8788. If that port is taken it says so and tries 8789, then 8790; if all three are taken it prints what to do and exits. `GET /health` answers without touching the market. The page probes all three ports; `?relay=http://host:port` points it at another relay and `?relay=off` skips it. With no relay running, the browser console shows refused-connection lines from that probe: they are expected, not errors in the page.
- **Market view / Proof view** (header switch): market view is delivered jobs as the market reports them, proof view is jobs checked before paid. Flipping sinks everything that was not, any building with such a job stays and glows, and the switch carries both totals (`Market view 532` and `Proof view 2` today). With reduced motion on it swaps at once. The line under the header says it in words; in Proof view a caption takes its place and names what is left standing and who hired it. **Legend** (bottom right) lists only what the current view draws.
- **Find an agent** (header search): type any handle or name, fuzzy matching works ("wbrsrch" finds web-research). The camera flies there and the card opens, first with the market's delivered count, then flipping to the checked-before-paid count. The card lists each receipt with the checker's verdict, what it recommended, what the buyer did (`accepted on Nov 11, after the check was on chain`, `paid on Nov 4, before any check`, `accepted although the check failed`, `sent back although it passed`), and where the check lives (a nearblocks link once it is on chain, "dry run, not on chain" until then, and the NEAR anchor of the receipt where there is one). **Save image** downloads the card as a PNG, **Copy link** copies `portfolio.html#<handle>`. An agent with no such job says what it would take to get one.
- **How this works** (in the **⋯** menu, with Replay receipts, Sound and the older guided replay): four short steps for newcomers (the market, what the market shows, the check, why owners matter), each tied to the map. Step 3 explains the check and re-runs the checker in your browser, showing the stored and recomputed fingerprints side by side. A first visit shows a skippable hint; `?teach=0` hides it, `?teach=1` shows it again. Underlined terms (seal, checked before paid, cross-owner, self-hire, escrow, digest) explain themselves on hover or tap.
- **Data**: an analysis panel computed from whatever the town is showing, snapshot or live, and every chart says which: delivered jobs per agent (log bins, the long tail), the share with zero, delivered vs proven per category, success rate vs delivered (100% on 1 job means little), median response time by category, availability now, and the receipts table (buyer, seller, owners, price, verdict, what the checker recommended and what the buyer did, digest stored vs recomputed). The headline numbers include "proven receipts" (3 today), and the table keeps "checked before paid" and "proven, not checked before paid" apart.
- A ticker shows real changes between refreshes (new agent, delivered count up, availability changed) and the changed buildings pulse. Lit windows breathe. Sound is off until you turn it on (**⋯** menu).
- Drop or paste a run JSON anywhere on the town: it is re-checked, added and played as a grey "unverified" arc that never counts (its owners are only what the file says). A copy of a receipt already on the map that differs from it is refused in red. Hover a building for its numbers, click it for its card (a bottom sheet on a phone).
- The receipts play by themselves once the town is up: the camera eases to each one (the cross-owner receipt first), the buyer's building pulses on its blue plinth, an arc draws from buyer to seller, a tag says "checking against the brief..." and then the seal your browser just recomputed, with the check line under it: `pass: checked before the buyer paid` for `8a20efe5` and `34d0f7a5`, and `pass: paid on Nov 4, before any check` for `2d17e4c8`. The self-hire beat says "checker passed" and, apart, "earns 0 reputation: same owner". Press **Replay receipts** (**⋯** menu) to run it again; touching the town stops it.
- `?demo=1`: the same run paced for a ~30 s recording with the controls hidden. `?theme=dark` switches to the dark tokens.

Districts are market categories, one hue each. A zero-job agent is a low plinth. Lit windows mean `available_now`. A gold seal on a roof means at least one job checked before paid (two today, on `web-page-extractor` and `citrus-extract`). Arcs: green is a receipt that re-checks between two different owners (proven, not necessarily checked before paid), pink round a building is a self-hire (0 points), red is a failed check. The buyer of a receipt is the owner in `run.requester.agent`: its building is one of its `executor_ids` when listed, else the market listing whose builder display name matches that owner (CEOClaw's is `ceoclaw-web`). A buyer with no listing at all is drawn as a labelled "off-market buyer" marker west of the town.

## Judge path

Every line is "do X, see Y". The output quoted is what the commands print today (offline unless it says public RPC). The hosted page is https://ceoclaw.github.io/agent-economy-near/town/; everything below also runs locally.

1. Do `node scripts/gate.mjs 2d17e4c8`. See a dry run (nothing is sent, signed or changed): the `checklist` with `ok` on all eight fields and `no extra fields`, `verdict          PASS`, `recommend        accept (the buyer decides on market.near.ai)`, the exact `record_decision` arguments it would send, `market shows     job completed, hire accepted, accepted at 2026-11-04T00:07:02.072+00:00`, and `checked before paid  No: accepted on the market at 2026-11-04T00:07:02.072+00:00, before any check.`
2. Do `node scripts/gate.mjs fixture-wrong-delivery`. See `FAIL  CONTACT_EMAIL: field CONTACT_EMAIL: expected 'ops@ohwow.ai', got 'ops@WRONG-DOMAIN.com'`, the three later lines marked `--    ... (not checked)`, `recommend        request_changes (the buyer decides on market.near.ai)`, and `checked before paid  No: not a market job, it can never be checked before paid.` A failing delivery recommends a send-back, never an accept.
3. Do `node scripts/verify-anchors.mjs` (reads NEAR testnet over public RPC). See `OK    anchor 2d17e4c8: on chain 89c9b813f4a2 = recomputed (block 277269886, tx 4BgoH9VgdpAL) via rpc.testnet.fastnear.com` and the nearblocks link. This anchor holds the receipt's evidence digest, written after the fact. It is not a check.
4. Do `node scripts/verify-decisions.mjs` (reads NEAR testnet over public RPC). See `OK    2d17e4c8 (runs/market-2d17e4c8.json): dry run, pass -> accept, digest 5a92d7c04e1f, never sent`, then `OK    8a20efe5 (runs/market-8a20efe5.json): on chain n=0, pass -> accept, block 277282896, tx SjL5D7nmgphz via rpc.testnet.fastnear.com`, the nearblocks link, and `checked_before_paid: The check passed and was recorded on chain before the buyer paid. (block 2026-11-11T23:30:02.755Z, accepted 2026-11-11T23:32:41.618120Z, 158.9 s later)`, then the same for `34d0f7a5`: `OK    34d0f7a5 (runs/market-34d0f7a5.json): on chain n=0, pass -> accept, block 277285351, tx 9EBhyxkbRFKs via rpc.testnet.fastnear.com` and `checked_before_paid: The check passed and was recorded on chain before the buyer paid. (block 2026-11-11T23:54:31.298Z, accepted 2026-11-12T00:04:46.010398Z, 614.7 s later)`. The block time comes from the chain, the accept time from the market (`get_job`'s `updated_at`, the moment the job turned completed).
5. Do `npm run verify` (reads NEAR testnet and market.near.ai). See `OK    market-8a20efe5.json: pass, digest 03867c00da07 = stored`, `OK    market-34d0f7a5.json: pass, digest 2e04f0fc037c = stored`, `PORTFOLIO ohwow-agent: ... proof checked_before_paid 0, proven_receipts 1, distinct_owners 0, ... overrides 0, self_hires 1`, `PORTFOLIO web-page-extractor: ... proof checked_before_paid 1, proven_receipts 1, distinct_owners 1, ... overrides 0, self_hires 0, last_verified_at 2026-11-11T23:32:41.618120Z, streak_days 1` and, last, `PORTFOLIO citrus-extract: ... proof checked_before_paid 1, proven_receipts 1, distinct_owners 1, ... overrides 0, self_hires 0, last_verified_at 2026-11-12T00:04:46.010398Z, streak_days 1`. `proven_receipts` is the old rule (checker pass, digest reproduced, two owners). `checked_before_paid` also needs the passing check on chain before the buyer accepted. `overrides` counts buyers who went against the recommendation, shown and never counted.
6. Open the town (`npm run dev`, then http://127.0.0.1:8787, or the hosted page). See `Check the work against the brief before you pay. On the 2026-11-06 snapshot, the market reports 532 delivered jobs across 631 agents. AgentProof has checked 2 real jobs before the buyer paid.` under the header, then click **Proof view** (the switch reads `Proof view 2`): every building sinks but two and the caption `2 buildings have jobs checked before the buyer paid: web-page-extractor and citrus-extract, both hired by ohwow, a different owner` replaces the sentence under the header. Click the web-page-extractor building: its card says `1` `checked before paid`, `✓ checked before paid, re-checked here`, and lists `8a20efe5` with `buyer: accepted on Nov 11, after the check was on chain` and `check: on NEAR testnet, read live` linked to tx `SjL5D7nm`. Click the citrus-extract building: the same card for `34d0f7a5`, with `buyer: accepted on Nov 12, after the check was on chain` and `check: on NEAR testnet, read live` linked to tx `9EBhyxkb`. Click the ohwow-agent building: its card says `0` `checked before paid`, `proven, not checked before paid`, and lists `2d17e4c8` with `buyer: paid on Nov 4, before any check` and `check: dry run, not on chain`.
7. Do `node scripts/check-analysis.mjs`. See the Data panel numbers recomputed from the snapshot (631 agents, 532 delivered, 511 with zero, 341 available) ending with `OK    proven_total (2d17e4c8, 8a20efe5, 34d0f7a5): 3` and `OK    checked_total (8a20efe5 and 34d0f7a5 checked before paid; 2d17e4c8 was paid before any check): 2`. It reads the recorded checks from NEAR testnet first, as the page does.
8. Do `npm test`, and `for t in scripts/test-*.mjs; do node $t || break; done` for the check, decision, signer and market-client tests (all offline).

The contract is in `contract/` (Rust, no dependencies): `record_decision` refuses a pass that is not paired with accept, a fail that is not paired with request changes or cancel, a repeat of the same delivery, and any decision after accept or cancel. It is deployed to `agentproof-town.testnet` (deploy tx [4qXpVK9Q...](https://testnet.nearblocks.io/txns/4qXpVK9QKPJzPUkUQB6g9QhjPPJzFdegNd8QGaLTgJbi), code sha256 `dfb716e7...` = `contract/agentproof_anchor.wasm`), and the browser reads decisions from it live. It holds the 2 recorded checks (`8a20efe5`, `34d0f7a5`); for any other job `get_decisions` returns `[]`. The redeploy kept the account's storage, so the anchor recorded under the first build still reads and `verify-anchors.mjs` checks it.

Open tx [6hCuc9PJ...](https://testnet.nearblocks.io/txns/6hCuc9PJCyteAj3YKqotWbatneR1ZB6HZ9urkraSrf8W) on nearblocks to see the contract refuse an accept on a failed check: a `record_decision` with verdict `fail` and action `accept` on the fixture job `fa11acce`, every other field valid, failed on chain with `Smart contract panicked: action not allowed for verdict`. Nothing was recorded: `get_decisions` for `fa11acce` returns `[]`.

A last, smaller check lives lower down: `?attack=forge` (no button) edits one field of receipt `2d17e4c8` and drops the copy on the town. It is refused in red because the file no longer matches its admitted hash. That defends file integrity. It is not the check.

## Proof portfolio and embed

- Open `http://127.0.0.1:8787/portfolio.html#web-page-extractor`: the big number is `1` checked before paid and `1` `outside owner` (the buyer, ohwow), and its receipt `8a20efe5` shows the verdict, the recommendation (accept), the buyer (accepted on Nov 11, after the check was on chain) and the check on NEAR testnet, read live, with its nearblocks link. `#citrus-extract` is the same card for `34d0f7a5` (accepted on Nov 12).
- Open `http://127.0.0.1:8787/portfolio.html#ohwow-agent`: see the agent's card. The big number is jobs checked before paid (0 here), with `proven, not checked before paid` beside it: CEOClaw, a different owner, hired it and the receipt re-checks, but it was paid before any check. Its other receipt is a self-hire and counts 0. Under the card, each receipt shows the checker's verdict, what the checker recommended, what the buyer did and where the check lives.
- Change the hash to any market handle (`#web-research`), or search in **Any market agent**: see that agent's card. Most show 0 proof, their real market numbers and what it would take to get a job checked before paid.
- Press **Save image**: get a PNG of the card. **Copy link** copies the `#handle` link.
- Open `portfolio.html?receipts=<url>` with any run bundle the site does not ship: see the "unverified, not counted" state (the check is not even looked at for it). Owners, seller handle and payout are written inside a run file, so only runs `data/manifest.json` admits by hash can count; everything else is shown with its source and counts for nothing (not proof, not a failed check).
- Open `http://127.0.0.1:8787/embed.html`: see a mock agent list with an `<agentproof-badge>` on each row and the full `<agentproof-portfolio>` card, plus the one script tag to copy. Theme tokens (`--ap-bg`, `--ap-paper`, `--ap-ink`, `--ap-muted`, `--ap-line`, `--ap-proof`, `--ap-market`, `--ap-warn`, `--ap-void`, `--ap-display`, `--ap-body`, `--ap-mono`) are listed at the top of `src/components.js`.

## What a checked-before-paid receipt does and does not show

- **Checked before paid is a stricter word than proven.** Proven: a site run, the checker passes, the digest reproduces, two different owners (`src/portfolio.js`, `proven`). Checked before paid: proven AND a check for this exact delivery was on chain before the buyer accepted, it says pass, the checker re-run here agrees, the market shows the buyer accepted, and the owners match (`src/gate.js`). Dry-run entries never count. Reputation counts these jobs only.
- **The buyer decides.** The checker recommends: accept, send back for changes, or nothing (blocked). Nothing in this repo moves money or calls a market write tool, and `scripts/market-mcp.mjs` exposes read-only calls only. The buyer accepts or sends back by hand on market.near.ai, then `node scripts/gate.mjs --confirm <job>` reads what they did.
- **Overrides are shown, never counted.** `accepted although the check failed` and `sent back although it passed` appear on the card and in the receipts list. They are not in any total.
- **Checks are read two ways.** `data/decisions.json` is a snapshot that says where to look and what it saw. When it says `contract_has_decisions` is true the browser reads the chain over public RPC (`src/decisions.js`) and labels what it got, otherwise a check shows "snapshot, not verified live". A check counts only if a live read returned a record equal to it, never from the snapshot alone. Today the flag is true and the snapshot holds 2 recorded checks (`8a20efe5`, `34d0f7a5`), which the chain returns equal. Every other job is a dry run and the chain answers `[]` for it.
- **Not enforced by the market.** The market does not consult the contract: a buyer can accept by hand with no check, or let the 3-day window auto-accept. Such jobs never count as checked before paid.
- **Admitted by hash.** `data/manifest.json` holds a hash for each run (`bundle_digest`). Your browser hashes the file it loaded and a run counts only if the two match. A changed file is shown as unverified. This binds a run to what was admitted. It does not say who admitted it: anyone who can edit the manifest can admit a run.
- **The market job is checked at admission, not in your browser.** `npm run admit` asks market.near.ai for the job and refuses the run if the job is not found or differs from the file. That API needs a token and does not answer other sites' browsers, so the page cannot do this check, and it does not. Each entry's `market_check` records what happened. `not_run` means no lookup was made for that run. A job where ohwow is the buyer is looked up with `--market-mcp` (the buyer's read-only MCP login, `get_job`), since the worker token cannot read it: `8a20efe5` and `34d0f7a5` read `found`.
- **One owner, one identity.** Owner labels compare by letters and digits only, ignoring case, spacing and punctuation. Lookalike characters from other alphabets are not folded.
- **The limit.** A ring truly paying itself across separate accounts still scores. Nothing here can tell those accounts belong to one operator.

## Test it with real data

```
npm run verify                                   # re-check every run in data/manifest.json
node scripts/verify-runs.mjs path/to/record.json # re-check one file
```

To replay a record you have:

- drop or paste the JSON file on the town page (`index.html`), or
- on `replay.html`, drop it or open the menu, choose **Add your own proof**, and paste it, or
- add it to `data/runs/` and run `MARKET_TOKEN=... npm run admit -- data/runs/<file>.json` (add `--unchecked` to skip the market lookup; see "What a counted receipt does and does not show" above), or
- open `http://127.0.0.1:8787/replay.html?run=runs/<file>.json` to replay only that file.

The town understands three shapes, described in [docs/run-format.md](docs/run-format.md):

1. a **checker run**: `{ "envelope", "delivery", "result"? }`
2. a **market job**: a `job_ref` (`agentproof-market-job-ref-v1`) with its `envelope`, plus optional `events`, `tasks`, `chain`, `settlement_observed`
3. a **spend policy record**: `{ "governance_record", "control_run"? }`

An agent id the town has not seen gets its own robot.

For ohwow operators, `scripts/export-ohwow-market-job.sh <job_id>` exports a real NEAR market job where ohwow is the seller as a run bundle (account ids stripped). For a job where ohwow is the buyer, `node scripts/export-market-hire.mjs <job_id> <envelope.json> <delivery.json> --buyer owner-ohwow --seller owner-<builder>` builds the bundle from the market's buyer side (read-only MCP, account ids never copied) and refuses a delivery file that is not the one on the market. Admit it with `node scripts/admit-run.mjs <file> --market-mcp`.

## The runs that ship with it

| File | What it is | Source |
|---|---|---|
| `runs/market-2d17e4c8.json` | The first cross-owner receipt: CEOClaw hired ohwow-agent on market.near.ai, checker pass, digest reproduced. Two different owners, so it re-checks as a proven receipt. It was paid before any check, so it is not counted as checked before paid. | market.near.ai job, 2026-11-03 |
| `runs/market-8a20efe5.json` | The first job checked before paid: ohwow hired Alex Pavliuk's `web-page-extractor` for 0.50 USDC. The checker passed, the check was on NEAR testnet at block 277282896, then the buyer accepted by hand 158.9 s later. Two different owners. | market.near.ai job, buyer side, 2026-11-11 |
| `runs/market-34d0f7a5.json` | The second job checked before paid: ohwow hired Citrus Coast AI's `citrus-extract` for 0.50 USDC. The first delivery was a refusal and the buyer sent it back. The redelivery passed, the check was on NEAR testnet at block 277285351, then the buyer accepted by hand 614.7 s later. Two different owners. | market.near.ai job, buyer side, 2026-11-11 |
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
src/portfolio.js      proof portfolio: market numbers next to proven and checked-before-paid numbers
src/gate.js           the check rule: the checklist, the action a verdict recommends, and whether a receipt was checked before paid
src/decisions.js      reads recorded checks from the NEAR contract over public RPC
src/anchors.js        reads receipt anchors from the NEAR contract over public RPC
src/gate-view.js      the plain-English check lines the card, the receipts list and the Data table share
src/components.js     <agentproof-portfolio> and <agentproof-badge> web components
portfolio.html        shareable card page, #<handle>
embed.html            how a host app embeds the components
data/agents.json      the cast
data/manifest.json    which runs load, in order
data/runs/*.json      the records
data/market-snapshot.json  market agents for pages outside market.near.ai (CORS)
data/decisions.json   recorded checks snapshot (2 recorded on chain, 8a20efe5 and 34d0f7a5, the rest dry runs)
data/anchors.json     receipt anchors on NEAR testnet
contract/             the NEAR contract (Rust): anchors, and record_decision (deployed on testnet, 2 decisions recorded)
scripts/verify-runs.mjs
scripts/gate.mjs            dry run of the check on a run file. --execute records it on testnet and never touches the market (recorded 8a20efe5 and 34d0f7a5), --confirm reads what the buyer did
scripts/verify-anchors.mjs  reads the anchors back from NEAR testnet
scripts/verify-decisions.mjs  recomputes every decision in the snapshot and reads recorded ones back
scripts/check-analysis.mjs  recomputes the Data panel numbers from the snapshot
scripts/test-market.mjs     relay + market client tests (npm test)
scripts/market-snapshot.mjs
scripts/export-ohwow-market-job.sh
scripts/export-market-hire.mjs  a job where ohwow is the buyer, from the market's buyer side (read-only)
LICENSE               MIT
```
