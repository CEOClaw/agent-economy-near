# Check Packs: pack, job, judge run and receipt formats

Versions: pack `agentproof-check-pack-v1`, job `agentproof-pack-job-v1`, judge run `agentproof-judge-run-v1`, receipt `agentproof-pack-receipt-v1`. Rules live once in `src/packs.js` (browser and Node, same code); this page is the contract.

Everything in this backtest is **mock**: no market hire, no spend, not market evidence. Every receipt carries `mock: true` and an `evidence_note` saying so.

## What a pack is

A public, versioned acceptance standard fixed before the work starts. A criterion has one of four types, and the type decides its trust level. Trust levels are shown side by side and are never added together; there is no overall score.

| Type | Trust | What it is | Re-checkable in the browser |
|---|---|---|---|
| `program` | Reproduced | Runs the same for everyone | yes |
| `source_replay` | Reproduced | Compares the delivery with a pinned source (an archived page hash) | yes, from the archive |
| `rubric` | Judged | A judge scores 1-5 against written anchors and must quote the deliverable | the quote match and arithmetic, not the opinion |
| `witness` | Witnessed | A named human states something, recorded as given | no |

`gate`: `"hard"` (program and source_replay: failing it fails the receipt), `{ "min": n }` (rubric: the median must reach n), or `"none"`. Weights exist only on rubrics and only combine rubrics (`weight_adjustable: true` lets the buyer set 0..10 in `job.weights`; otherwise the job is refused).

## Pack file (`data/packs/<id>.json`)

```json
{ "schema": "agentproof-check-pack-v1", "id": "site-brief-v1", "version": "1.0.0", "title": "...", "summary": "...",
  "criteria": [
    { "id": "required-copy", "type": "program", "check": "copy_present", "gate": "hard", "label": "..." },
    { "id": "delivered-hash", "type": "source_replay", "check": "delivery_hash", "gate": "hard", "label": "..." },
    { "id": "brief-fit", "type": "rubric", "gate": { "min": 3 }, "weight": 3, "weight_adjustable": false, "label": "...",
      "anchors": { "1": "...", "3": "...", "5": "..." }, "examples": { "1": "...", "3": "...", "5": "..." } },
    { "id": "buyer-accepted", "type": "witness", "gate": "none", "label": "..." } ] }
```

Packs are general: no fixture-specific strings. Judges score only against the anchors.

| Pack | Deliverable | Checks |
|---|---|---|
| `site-brief-v1` | HTML page | required copy, CTA link, sections (heading or id, not a bare run of the names), no unbriefed claims (guarantee, price, certification, verification wording not in the brief), style match (not gated: read from CSS, can be `not_checkable`), delivered hash; rubrics brief-fit (min 3, weight 3), copy-discipline (min 3, weight 2), polish (no gate, from text and structure, no screenshots); witness |
| `research-brief-v1` | Markdown with `## Question`, `## Findings` (claims are bullets ending in `[S1]`), `## Sources` lines `[S1] <url> "exact quoted text"` | sections, every claim cited, URLs have an archived 2xx record, every quote is in its archived page; rubrics answers-question (min 3, weight 3), source-quality (no gate, weight 2, adjustable); witness |
| `file-transform-v1` | PNG, CSV to JSON, PDF, or a field-extraction delivery JSON, by `params.transform` | output format, size target, content preserved, metadata clean; rubric fit-for-use (text renditions only, else `not_applicable` and no judge is called); witness |

`file-transform-v1` transforms: `png-strip-metadata` (chunks and CRCs parsed, inflated IDAT compared via `DecompressionStream`, no tEXt, iTXt, zTXt, eXIf or tIME left), `csv-to-json` (rows and fields preserved as strings, so lost leading zeros are caught), `pdf-extract-pages` (uncompressed PDFs only: page count, per-page text, no /Author, /Creator, /Producer and the like; object streams, filters or encryption give `not_checkable`), `field-extraction` (wraps `AgentProofChecker.check`; its digest must equal `params.expected_digest`).

## Job file (`data/backtest/fixtures/<id>/job.json`)

```json
{ "schema": "agentproof-pack-job-v1", "id": "site-v3", "pack": "site-brief-v1", "brief": "<text the seller got>",
  "params": { "required_copy": ["..."], "cta": { "text": "Start now", "href": "https://..." }, "sections": ["hero"], "style": "dark",
              "declared_sha256": "<64 hex, the seller's declared hash>", "redact": ["CEOClaw", "ceoclaw"] },
  "weights": { "polish": 2 }, "buyer_label": "owner-ohwow", "seller_label": "ceoclaw-web" }
```

Params by pack: site `required_copy`, `cta`, `sections`, `style` (`dark` or `light`), `declared_sha256`. Research: none beyond `redact`. File transform: `transform`, plus `max_bytes`, `input_file` and `input_sha256` (path relative to `data/`), `pages` and `expected_pages` (PDF), `envelope` and `expected_digest` (field-extraction).

`params.redact`: names replaced by `[seller]` in the judge text. Quote matching runs on that same redacted text. Judges never see agent names, labels or fixture ids.

A fixture directory also has `meta.json` (`input_origin`, `committed_at`, `delivered_at`, `before_delivery`, `note`, `evidence_note`, `agent`, `deliverable {file, media_type}`, `sources [{id, url}]`, `witnesses {criterion-id: {statement, by, at, ref}}`), read by `scripts/pack-run.mjs` and not part of the job hash.

## Rules (implemented once, used by the runner and by re-check)

- **Hashes**: sha256 hex over `canonicalJson` (from `src/checker.js`) for JSON, over raw bytes for files.
- **Normalize**: NFKC, curly quotes to straight, dashes to `-`, whitespace collapsed, case-sensitive.
- **Judge text** `judgeText(bytes, media_type, job)`: HTML has script, style, comments and tags removed with regexes (no DOM; block tags become line breaks; a `>` inside a quoted attribute does not end a tag), entities decoded, then names redacted. Other text is used as is with `\n` line ends. Binary types have no text rendition (`null`). Hidden elements are not removed, so hidden text reaches the judges and the injection scan.
- **Quote**: a score is void if its quote, normalized, is under 12 characters or absent from the normalized judge text, or if the score is not an integer 1 to 5. A judge that failed or skipped a criterion counts as a void score.
- **Aggregation**: `valid_n` = non-void scores. Under 2: `no_quorum`, no median. Median of valid scores (mean of the middle two when even). `spread` = max - min. `contested` = spread >= 2. Rubric status: `not_run`, `not_applicable`, `no_quorum`, `contested` (median stored, never treated as passing), else `pass` or `fail` by gate min (no gate: pass).
- **Verdict**, checked in this order, the earliest match wins: any hard gate failed: `fail`. Any gated rubric below its min: `fail`. Any gated rubric contested: `contested`. Any hard gate `not_checkable`, or a gated rubric `not_run` or `no_quorum`: `incomplete`. Else `pass`. Failing closed matters: a PDF with object streams is `not_checkable`, never passed.
- **Trust block**: `reproduced {passed, total, hard_failed}` counts program and source criteria except `not_applicable`; `judged {weighted_median, rated, contested, void, not_run}` is the weighted mean of medians over `pass` and `fail` rubrics only (null if none); `witnessed` lists statements. Nothing mixes them.
- **Injection scan**: instruction-like text in the raw deliverable (visible, hidden, comments) is matched against a fixed pattern list and stored in `receipt.injection`, flagged regardless of what the judges do.

## Judge run file (`agentproof-judge-run-v1`): the seam between the judge and the runner

Written by `scripts/pack-judge.mjs`, read by `scripts/pack-run.mjs --judge-run <file>` (path under `data/`). The runner makes no LLM call.

```json
{ "schema": "agentproof-judge-run-v1", "job": "site-v3", "prompt_version": "...",
  "judges": [ { "label": "J1", "model": "<id the API returned>", "ok": true, "injection_seen": false,
                "scores": [ { "criterion": "brief-fit", "score": 4, "quote": "...", "reason": "..." } ] } ] }
```

`job` must equal the job id. `ok: false` or a missing criterion makes that judge's score void. Extra fields (usage, raw response refs) are ignored and stay in the file, whose sha256 goes into `receipt.panel.run_sha256`.

## Receipt (`data/backtest/receipts/<id>.json`)

Fields as in the build brief; the spec of record is what `buildReceipt` in `src/packs.js` emits. Key points:

- `commitment` holds `pack_hash`, `job_hash`, `rubric_hash` (canonical hash of the rubric criteria including anchors and effective weights), `committed_at`, `delivered_at`, `before_delivery`, `note`, and a `hash` over those fields.
- `before_delivery: false` means the pack was written after the work: a post-hoc backtest. The site backtest is not blind for the pack author, who had read the deliverables and the hand reviews. Judges are blind.
- `panel` is `null` when no judge run was merged; rubrics are then `not_run` and the verdict is `incomplete`.
- `receipt_hash` is the sha256 of the canonical receipt without that field.

Backtest index: `data/backtest/index.json` (`agentproof-backtest-index-v1`) lists `{id, file, pack, agent, input_origin, verdict, receipt_hash}` per receipt, file paths relative to `data/`.

## Re-check

`AgentProofPacks.recheck(receipt, load)` where `load(path)` resolves a path relative to `data/` to a `Uint8Array`. It never throws. It returns `{ ok, recomputed, not_recomputed, opinions }`.

- **Recomputed**: pack, job, rubric, commitment, deliverable and each archive hash; every program and source criterion re-run (status and detail must match); every quote match; median, spread, contested and status; injection scan; trust block; verdict and its reason; judge run file hash; receipt hash; the mock label.
- **Not recomputed**: each judge opinion (stored, cannot be rerun in the browser), URL resolution at fetch time (a recorded fact), each witness statement, timestamps.

**Green or red is integrity, not the verdict.** A receipt with verdict `fail` can be fully intact and green. Do not read one as the other.

## Reputation

`AgentProofPacks.reputation(receipts)` returns one row per agent per pack and version: `{ agent, pack, version, jobs, distinct_buyers, passed, pass_rate (whole percent), verdicts {pass, fail, contested, incomplete}, mock, input_origins }`. Never a global number. Mock receipts are not market proof and must not move a card's verified-job count.

## Limits, stated plainly

- **Tamper evidence stops at the receipt.** `receipt_hash` catches a one-byte change. Someone who rewrites every hash at once is not caught without an external anchor or a signature. Nothing here is anchored. `committed_at` is self-asserted.
- Judges can be wrong and share blind spots. The panel reports a median and a spread, and says `contested` rather than inventing a number.
- `style-match` reads only inline `<style>` CSS and gives `not_checkable` when it cannot resolve a background colour.
- `no-unbriefed-claims` is a word list. It catches common wording, not every invention; the copy-discipline rubric is the second look.
- Archived pages are copies at fetch time. The receipt records origin (`real-fetch` or `mock`) for each.
