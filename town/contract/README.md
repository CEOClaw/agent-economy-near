# agentproof_anchor: the NEAR testnet anchor and acceptance-gate contract

A write-once log of `job_id -> evidence digest`. About 500 lines of Rust plus its tests, `#![no_std]`, **zero crate dependencies**: the
NEAR host functions are declared by hand at the top of `src/lib.rs`, so one file is the whole contract. It holds no
Check Packs logic and no funds. **Testnet only**: deployed to `agentproof-town.testnet`.

- `record({"job_id","digest","checker_version"})` change method. Only the contract account itself may call it
  (`only the owner can record`). Write-once (`already recorded`). `job_id` is `[0-9a-f-]{1,64}`, `digest` is 64 lowercase
  hex, `checker_version` is `[A-Za-z0-9._:-]{1,64}`. Stores and returns the record.
- `get({"job_id"})` view. Returns `{"job_id":"...","digest":"...","checker_version":"...","block_height":N,"block_timestamp_ms":N}` or `null`.

The anchored digests are checked by `node scripts/verify-anchors.mjs`: it re-runs the checker, reads the contract live over
JSON-RPC, and compares the on-chain code hash with `agentproof_anchor.wasm`.

## The gate (deployed 2026-11-11, no decision recorded yet)

`src/lib.rs` also carries the acceptance gate. It is deployed to `agentproof-town.testnet` in deploy tx
[`4qXpVK9QKPJzPUkUQB6g9QhjPPJzFdegNd8QGaLTgJbi`](https://testnet.nearblocks.io/txns/4qXpVK9QKPJzPUkUQB6g9QhjPPJzFdegNd8QGaLTgJbi)
(block 277277611). The on-chain `code_hash` is `agentproof_anchor.wasm`:

```
dfb716e76d1f867ae678bb340c95923b19b1418ef6c4de979ce166c34c82be62   10328 bytes
```

The first build (`record` / `get` only, sha256 `46e73740...`, deploy tx `4xnJEhK8...`) is kept as `v1/agentproof_anchor.wasm`
because `scripts/test-near-tx.mjs` rebuilds that real deploy tx byte for byte. The redeploy kept the account's storage: the
contract has no state struct, only raw keys, and the one key on chain before it was the bare-job_id `2d17e4c8` anchor, which
still reads the same bytes. `get_decisions` and `list` answer `[]` until the first check is recorded.

- `record_decision({"job_id","delivery_digest","checker_version","verdict","action","buyer_owner","seller_owner"})`
  change method, owner only. All strings. `verdict` is `pass|fail|blocked`, `action` is `accept|request_changes|cancel|none`,
  owners are `[a-z0-9]{1,64}`. The pairing is enforced here: pass -> accept; fail -> request_changes or cancel;
  blocked -> none or cancel (`action not allowed for verdict`). A job's first decision is `n=0`. A follow-up is only a
  redelivery: its `delivery_digest` must differ from the latest one (`already decided`). After accept or cancel the job
  is `job settled`. At most 16 per job (`too many decisions`). Returns the stored record, with `n`, `block_height`,
  `block_timestamp_ms`.
- `get_decisions({"job_id"})` view. JSON array of the job's decisions, oldest first, `[]` if none.
- `list({"from":N,"limit":N})` view. JSON array of decisions in global record order. `limit` is 1..10, both JSON integers.

Storage: v1 keeps its bare `job_id` keys untouched. Gate keys: `d:<job_id>:<n>` (decision), `m:<job_id>` (digest of the
latest + settled flag + count), `g:<i>` (global order, `<job_id>:<n>`), `gn` (total). Every gate key holds a `:` or is
`gn`, and a job_id can never hold either, so the two key spaces cannot collide.

Tests (host mock of the NEAR imports, no near-workspaces): `cd contract && cargo test --target aarch64-apple-darwin`
(`.cargo/config.toml` forces the wasm target otherwise).

## Reproduce the wasm

```
cd contract
rustup toolchain install 1.99.1 --profile minimal --target wasm32v1-none   # rust-toolchain.toml pins this
cargo build --release --locked
shasum -a 256 target/wasm32v1-none/release/agentproof_anchor.wasm
```

Expected sha256 (also the on-chain `code_hash` of `agentproof-town.testnet`, and `code_sha256` in `data/anchors.json`):

```
dfb716e76d1f867ae678bb340c95923b19b1418ef6c4de979ce166c34c82be62
```

`agentproof_anchor.wasm` in this folder is that build, committed because `verify-anchors` reads it. Target
`wasm32v1-none` is MVP-feature wasm (no bulk-memory or reference-types), which the NEAR runtime accepts.
