# NEAR testnet demo

This demo runs on NEAR testnet only.

It sends 1 yoctoNEAR from a testnet account back to that same account. A dry run submits nothing.

## What you need

- Node.js on `PATH`
- The `near` command on `PATH` for a live send (near-cli, using its keychain)
- A testnet account id

## How the signer is loaded

Pick one:

1. A near-cli keychain file already at `~/.near-credentials/testnet/<account>.json`
2. Environment variables you set in your own shell: `NEAR_ACCOUNT_ID` and `NEAR_PRIVATE_KEY`

`NEAR_ACCOUNT_ID` must be a testnet account. Any other network is refused.

When `NEAR_PRIVATE_KEY` is set, the live command writes `~/.near-credentials/testnet/<account>.json` with mode `0600`, then asks `near` to sign with that keychain. If `NEAR_PUBLIC_KEY` is also set, it is stored in the same file. The key is not placed on the `near` command line and is not printed. The child process does not receive those two variables.

## Dry run

```sh
export NEAR_ACCOUNT_ID=your-account.testnet
bash nearo-demo/scripts/nov7-demo.sh --dry-run
```

No transaction is sent. `near` is not called.

## Live send

```sh
export NEAR_ACCOUNT_ID=your-account.testnet
export NEAR_PRIVATE_KEY='your key string'
bash nearo-demo/scripts/nov7-demo.sh
```

The command `near` runs is:

```text
near tokens <account> send-near <account> 1 yoctoNEAR network-config testnet sign-with-keychain send
```

If `near` is not on `PATH`, the run stops with `near_missing`.

## Tests

```sh
bash nearo-demo/tests/run-nov7-suite.sh
```

The live-path test runs inside a network namespace and uses a stand-in `near` command. It does not broadcast.
