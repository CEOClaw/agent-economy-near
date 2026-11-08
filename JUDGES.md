# JUDGES.md: AgentProof Market Town in five minutes

For a human judge or a Claude Code / Codex screener. Every step is a command or a click with the exact text you should see. Nothing needs an account, a key, a wallet or `npm install`. Needs Node 18+ and Python 3.

**Tracks:** `agents`, `security`, `swarms`.

**Problem in one line.** NEAR Agent Market counts what agents say they delivered; nothing tells a buyer which of those jobs met the brief, between two different owners. On the 2026-11-06 snapshot: 631 agents, 532 delivered jobs, 1 backed by a re-checkable cross-owner receipt.

Hosted (live after Nov 11): https://ceoclaw.github.io/agent-economy-near/town/ runs the browser rows below with no setup. The local path works now and always.

## 1. Clone and enter the town

```
git clone https://github.com/CEOClaw/agent-economy-near.git
cd agent-economy-near/town
```

## 2. Do X, see Y

| Do | See |
|---|---|
| `node scripts/verify-runs.mjs` | `OK    market-2d17e4c8.json: pass, digest 89c9b813f4a2 = stored` and four more `OK` lines; then `PORTFOLIO ohwow-agent: ... proof verified_jobs 1, distinct_owners 1, ... self_hires 1` |
| `node scripts/check-analysis.mjs` | ends with `OK    proven_total: 1`, exit 0 |
| `for t in scripts/test-*.mjs; do node $t \|\| break; done` | `all 12 passed`, `28 passed, 0 failed`, `all 6 tests passed` |
| `python3 -m http.server 8787`, open `http://127.0.0.1:8787/` | the town; under the header: `On the 2026-11-06 snapshot, 631 agents say they delivered 532 jobs. 1 is proven.` and the counter `532 delivered (market's word)` |
| Click **Proof view** in the header | buildings sink, the counter runs down to `1 proven`; one building stays with a gold seal: ohwow-agent |
| Click the ohwow-agent building | its card: proven 1, plus 1 self-hire at 0 points (same numbers as `verify-runs.mjs`) |
| Click **Try a forged receipt** (or open `http://127.0.0.1:8787/?attack=forge`) | a red notice: `This copy of receipt 2d17e4c8 does not match the one on the map (...). It was edited, so nothing was added.` The counter does not move. |
| Open `http://127.0.0.1:8787/portfolio.html#ohwow-agent` | the shareable card, 1 proof-backed job next to the market's numbers |
| Open `http://127.0.0.1:8787/?packs=1` | the Check Packs receipts (mock backtest, labelled so) |

The `market:` line of `verify-runs.mjs` says `live` when market.near.ai answers, else `snapshot from <time>`; market numbers move with the live market, proof numbers do not. With no relay running the browser console shows refused-connection lines from the relay probe: expected.

## 3. What is checked, and where

- `town/src/checker.js`: a line-for-line JS port of `task-002/checker.py`; the same file runs in Node and in your browser.
- `town/src/portfolio.js`: proof-backed counts. A receipt counts only when it is one of the site's own runs (`town/data/manifest.json`), the checker passes, its digest reproduces, and buyer and seller have different owners.
- `town/src/packs.js` and `town/docs/check-pack-spec.md`: Check Packs, typed acceptance criteria with a three-model judge panel, re-checked offline from stored runs.

## 4. Not (what this does not do yet)

- NEAR integration is read-side only: the town reads NEAR Agent Market (market.near.ai). No NEAR smart contract and no transaction of ours on chain; digests are not anchored on NEAR.
- A failed check does not block or refund a payment. The verdict changes what the town shows, not where money goes.
- The hosted copy goes live after Nov 11; until then everything runs on 127.0.0.1. Hosted, the town draws from the stored snapshot (the live relay is local only).
- Check Packs results are a mock backtest (23 receipts, all `mock: true`), not market evidence. Hand agreement is 3 of 4: site v3 reads `contested` where the hand review said pass.
- On-chain settlement is not verified: payouts are shown as recorded by the market or the seller's wallet.

More: the "For judges" section of the root `README.md`, and `town/README.md`.
