// Offline tests for scripts/near-tx.mjs. No network, no real key: the real anchor tx is a committed fixture and keys are generated here.
// Run: node scripts/test-near-tx.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "./near-tx.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(fs.readFileSync(path.join(dir, "fixtures/near-tx/anchor-tx-4BgoH9Vg.json"), "utf8"));
let failed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);
const fields = () => ({ signerId: fx.signer_id, publicKey: fx.public_key, nonce: fx.nonce, receiverId: fx.receiver_id, blockHash: fx.reference_block_hash, methodName: fx.method_name, args: Buffer.from(fx.args_base64, "base64"), gas: fx.gas, deposit: fx.deposit });
const throwaway = () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32), pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return { seed, pub, publicKey: "ed25519:" + T.b58encode(pub), secretKey: "ed25519:" + T.b58encode(Buffer.concat([seed, pub])) };
};

test("base58 round-trips, including leading zero bytes", () => {
  for (const b of [Buffer.from([0, 0, 1, 2, 255]), crypto.randomBytes(32), Buffer.from([0])]) assert.deepEqual(T.b58decode(T.b58encode(b)), b);
});

test("the real anchor tx: buildFunctionCall reproduces tx hash 4BgoH9Vg... exactly", () => {
  assert.equal(T.txHash(T.buildFunctionCall(fields())), fx.tx_hash);
  assert.equal(fx.tx_hash, "4BgoH9VgdpALFpsBi3fG4svybiiPP4APZCTw6hH6S5pa");
});

test("the real anchor tx: the stored signature verifies against the stored public key, and not against changed bytes", () => {
  const bytes = T.buildFunctionCall(fields());
  assert.equal(T.verifySig(bytes, fx.signature, fx.public_key), true);
  assert.equal(T.verifySig(T.buildFunctionCall({ ...fields(), nonce: BigInt(fx.nonce) + 1n }), fx.signature, fx.public_key), false);
});

test("args may be an object: it is JSON-encoded to the same bytes", () => {
  const obj = JSON.parse(Buffer.from(fx.args_base64, "base64").toString());
  // the chain stored the keys in this order, JSON.stringify keeps insertion order
  assert.deepEqual(T.buildFunctionCall({ ...fields(), args: obj }), T.buildFunctionCall(fields()));
});

test("sign/verify round-trip with a throwaway key; the signed tx is bytes + 0x00 + 64-byte signature", () => {
  const k = throwaway();
  const bytes = T.buildFunctionCall({ ...fields(), signerId: "x.testnet", publicKey: k.publicKey });
  const signed = T.sign(bytes, k.secretKey);
  assert.equal(signed.length, bytes.length + 65);
  assert.deepEqual(signed.subarray(0, bytes.length), bytes);
  assert.equal(signed[bytes.length], 0);
  const sig = "ed25519:" + T.b58encode(signed.subarray(bytes.length + 1));
  assert.equal(T.verifySig(bytes, sig, k.publicKey), true);
  assert.equal(T.verifySig(Buffer.concat([bytes, Buffer.from([1])]), sig, k.publicKey), false);
});

test("loadKey reads a near-credentials file (64-byte and 32-byte secrets), and refuses a mismatched pair", () => {
  const k = throwaway(), d = fs.mkdtempSync(path.join(os.tmpdir(), "ap-key-")), f = path.join(d, "k.json");
  try {
    fs.writeFileSync(f, JSON.stringify({ account_id: "a.testnet", public_key: k.publicKey, private_key: k.secretKey }), { mode: 0o600 });
    assert.deepEqual(T.loadKey(f), { accountId: "a.testnet", publicKey: k.publicKey, secretKey: k.secretKey });
    fs.writeFileSync(f, JSON.stringify({ account_id: "a.testnet", public_key: k.publicKey, private_key: "ed25519:" + T.b58encode(k.seed) }));
    assert.equal(T.loadKey(f).secretKey, k.secretKey);
    const other = throwaway();
    fs.writeFileSync(f, JSON.stringify({ account_id: "a.testnet", public_key: k.publicKey, private_key: other.secretKey }));
    assert.throws(() => T.loadKey(f), /does not match/);
    fs.writeFileSync(f, JSON.stringify({ implicit_account_id: "ab12", public_key: k.publicKey, private_key: k.secretKey }));
    assert.equal(T.loadKey(f, "b.testnet").accountId, "b.testnet");
    assert.throws(() => T.loadKey(f), /not a near-credentials/);
    fs.writeFileSync(f, JSON.stringify({ account_id: "a.testnet" }));
    assert.throws(() => T.loadKey(f), /not a near-credentials/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

// A fake RPC: answers by method, records calls. send_tx's reply is supplied by the test.
const rpcFake = (key, sendReply) => {
  const calls = [];
  const f = async (url, init) => {
    const b = JSON.parse(init.body); calls.push({ url, method: b.method, params: b.params });
    const ok = (result) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: "gate", result }) });
    if (b.method === "query" && b.params.request_type === "view_access_key") return ok({ nonce: 41, block_height: 1, block_hash: "x" });
    if (b.method === "block" && b.params.finality) return ok({ header: { hash: fx.reference_block_hash, height: 5 } });
    if (b.method === "block") return ok({ header: { hash: b.params.block_id, height: 7 } });
    if (b.method === "send_tx") return sendReply(b.params);
    throw new Error("unexpected " + b.method);
  };
  f.calls = calls; return f;
};

test("callMethod: nonce is access-key nonce + 1, the tx sent is signed by the key, wait_until FINAL, result carries tx + block height", async () => {
  const k = throwaway(), key = { accountId: "a.testnet", publicKey: k.publicKey, secretKey: k.secretKey };
  const f = rpcFake(key, (p) => ({ ok: true, status: 200, json: async () => ({ result: { final_execution_status: "FINAL", status: { SuccessValue: "" }, transaction: { hash: "HASH" }, transaction_outcome: { block_hash: "BH" }, receipts_outcome: [] } }) }));
  const r = await T.callMethod({ rpc: ["https://r.example"], key, contract: "c.testnet", method: "record_decision", args: { job_id: "j" }, fetchFn: f });
  assert.equal(r.tx, "HASH"); assert.equal(r.block_height, 7);
  const send = f.calls.find((c) => c.method === "send_tx");
  assert.equal(send.params.wait_until, "FINAL");
  const raw = Buffer.from(send.params.signed_tx_base64, "base64"), tx = raw.subarray(0, raw.length - 65);
  assert.equal(T.verifySig(tx, "ed25519:" + T.b58encode(raw.subarray(raw.length - 64)), k.publicKey), true);
  // the nonce sits after: u32 len + signer, 33-byte key
  assert.equal(tx.readBigUInt64LE(4 + "a.testnet".length + 33), 42n);
  assert.equal(f.calls.filter((c) => c.method === "send_tx").length, 1);
});

test("callMethod: a contract panic surfaces its text; an RPC-level error names the tx hash; neither is retried", async () => {
  const k = throwaway(), key = { accountId: "a.testnet", publicKey: k.publicKey, secretKey: k.secretKey };
  const panic = rpcFake(key, () => ({ ok: true, status: 200, json: async () => ({ result: { status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: already decided" } } } } }, transaction: { hash: "H" }, transaction_outcome: { block_hash: "B" }, receipts_outcome: [] } }) }));
  await assert.rejects(T.callMethod({ rpc: "https://r.example", key, contract: "c", method: "m", args: {}, fetchFn: panic }), /already decided/);
  const rpcErr = rpcFake(key, () => ({ ok: true, status: 200, json: async () => ({ error: { message: "Server error", data: "timeout" } }) }));
  await assert.rejects(T.callMethod({ rpc: ["https://r.example"], key, contract: "c", method: "m", args: {}, fetchFn: rpcErr }), /timeout.*|tx [1-9A-Za-z]+/);
  assert.equal(rpcErr.calls.filter((c) => c.method === "send_tx").length, 1);
  // a panic in a later receipt (not the top-level status) is also a failure
  const late = rpcFake(key, () => ({ ok: true, status: 200, json: async () => ({ result: { status: { SuccessValue: "" }, transaction: { hash: "H" }, transaction_outcome: { block_hash: "B" }, receipts_outcome: [{ outcome: { status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: job settled" } } } } } } }] } }) }));
  await assert.rejects(T.callMethod({ rpc: "https://r.example", key, contract: "c", method: "m", args: {}, fetchFn: late }), /job settled/);
});

test("viewMethod: a final call_function with JSON args, decodes the bytes; falls back across RPCs on transport failure only", async () => {
  const calls = [];
  const f = async (url, init) => { calls.push(url); if (url === "https://a.example") throw new Error("down"); return { ok: true, status: 200, json: async () => ({ result: { result: Array.from(Buffer.from('[{"n":0}]')) } }) }; };
  assert.deepEqual(await T.viewMethod({ rpc: ["https://a.example", "https://b.example"], contract: "c", method: "get_decisions", args: { job_id: "j" }, fetchFn: f }), [{ n: 0 }]);
  assert.deepEqual(calls, ["https://a.example", "https://b.example"]);
  const bad = async () => ({ ok: true, status: 200, json: async () => ({ error: { data: "no such method" } }) });
  await assert.rejects(T.viewMethod({ rpc: "https://a.example", contract: "c", method: "x", fetchFn: bad }), /no such method/);
});

const dfx = JSON.parse(fs.readFileSync(path.join(dir, "fixtures/near-tx/deploy-tx-4xnJEhK8.json"), "utf8"));
const dcode = fs.readFileSync(path.join(dir, "..", dfx.code_file));
const dfields = () => ({ signerId: dfx.signer_id, publicKey: dfx.public_key, nonce: dfx.nonce, receiverId: dfx.receiver_id, blockHash: dfx.reference_block_hash, code: dcode });

test("the real deploy tx: the committed wasm is the one it deployed, and buildDeploy reproduces tx hash 4xnJEhK8... exactly", () => {
  assert.equal(crypto.createHash("sha256").update(dcode).digest("hex"), dfx.code_sha256_hex);
  assert.equal(T.txHash(T.buildDeploy(dfields())), dfx.tx_hash);
  assert.equal(dfx.tx_hash, "4xnJEhK8VeaMXHkmb3GLrWocDtNb1gGb8xFzBrscngwJ");
});

test("the real deploy tx: the stored signature verifies, and not against a changed nonce or code", () => {
  assert.equal(T.verifySig(T.buildDeploy(dfields()), dfx.signature, dfx.public_key), true);
  assert.equal(T.verifySig(T.buildDeploy({ ...dfields(), nonce: BigInt(dfx.nonce) + 1n }), dfx.signature, dfx.public_key), false);
  assert.equal(T.verifySig(T.buildDeploy({ ...dfields(), code: Buffer.concat([dcode, Buffer.from([0])]) }), dfx.signature, dfx.public_key), false);
});

test("buildDeploy refuses an empty wasm and a short block hash", () => {
  assert.throws(() => T.buildDeploy({ ...dfields(), code: Buffer.alloc(0) }), /empty wasm/);
  assert.throws(() => T.buildDeploy({ ...dfields(), blockHash: "1111" }), /32 bytes/);
});

test("codeHash is base58(sha256(wasm))", () => {
  assert.equal(T.b58decode(T.codeHash(dcode)).toString("hex"), dfx.code_sha256_hex);
});

const deployFake = (key, { codeHash: onChain, sendReply }) => {
  const calls = [];
  const f = async (url, init) => {
    const b = JSON.parse(init.body); calls.push({ url, method: b.method, params: b.params });
    const ok = (result) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: "gate", result }) });
    if (b.method === "query" && b.params.request_type === "view_access_key") return ok({ nonce: 41, block_height: 1, block_hash: "x" });
    if (b.method === "query" && b.params.request_type === "view_account") return ok({ amount: "1", code_hash: onChain, storage_usage: 1 });
    if (b.method === "block" && b.params.finality) return ok({ header: { hash: dfx.reference_block_hash, height: 5 } });
    if (b.method === "block") return ok({ header: { hash: b.params.block_id, height: 9 } });
    if (b.method === "send_tx") return sendReply ? sendReply(b.params) : ok({ final_execution_status: "FINAL", status: { SuccessValue: "" }, transaction: { hash: "DH" }, transaction_outcome: { block_hash: "BH" }, receipts_outcome: [] });
    throw new Error("unexpected " + b.method);
  };
  f.calls = calls; return f;
};
const wasmFile = path.join(dir, "..", dfx.code_file);

test("deployContract: sends one signed DeployContract (nonce+1, FINAL), reads view_account back, returns tx + height + code_hash", async () => {
  const k = throwaway(), key = { accountId: "a.testnet", publicKey: k.publicKey, secretKey: k.secretKey };
  const f = deployFake(key, { codeHash: T.codeHash(dcode) });
  const r = await T.deployContract({ rpc: "https://r.example", key, contract: "a.testnet", wasmPath: wasmFile, fetchFn: f });
  assert.deepEqual(r, { tx: "DH", block_height: 9, code_hash: T.codeHash(dcode) });
  const sends = f.calls.filter((c) => c.method === "send_tx");
  assert.equal(sends.length, 1); assert.equal(sends[0].params.wait_until, "FINAL");
  const raw = Buffer.from(sends[0].params.signed_tx_base64, "base64"), tx = raw.subarray(0, raw.length - 65);
  assert.deepEqual(tx, T.buildDeploy({ signerId: "a.testnet", publicKey: k.publicKey, nonce: 42n, receiverId: "a.testnet", blockHash: dfx.reference_block_hash, code: dcode }));
  assert.equal(T.verifySig(tx, "ed25519:" + T.b58encode(raw.subarray(raw.length - 64)), k.publicKey), true);
  // the read-back comes after the send
  assert.ok(f.calls.findIndex((c) => c.params?.request_type === "view_account") > f.calls.findIndex((c) => c.method === "send_tx"));
});

test("deployContract: a different on-chain code_hash is an error naming the tx; a chain failure is an error; neither retries the send", async () => {
  const k = throwaway(), key = { accountId: "a.testnet", publicKey: k.publicKey, secretKey: k.secretKey };
  const stale = deployFake(key, { codeHash: "11111111111111111111111111111111" });
  await assert.rejects(T.deployContract({ rpc: "https://r.example", key, contract: "a.testnet", wasmPath: wasmFile, fetchFn: stale }), /code_hash 1{32} != expected/);
  assert.equal(stale.calls.filter((c) => c.method === "send_tx").length, 1);
  const failed = deployFake(key, { codeHash: T.codeHash(dcode), sendReply: () => ({ ok: true, status: 200, json: async () => ({ result: { status: { Failure: { ActionError: { kind: { LackBalanceForState: {} } } } }, transaction: { hash: "H" }, transaction_outcome: { block_hash: "B" }, receipts_outcome: [] } }) }) });
  await assert.rejects(T.deployContract({ rpc: "https://r.example", key, contract: "a.testnet", wasmPath: wasmFile, fetchFn: failed }), /deploy failed on chain/);
  assert.equal(failed.calls.filter((c) => c.method === "send_tx").length, 1);
});

for (const [name, fn] of tests) { try { await fn(); console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + "\n  " + (e.stack || e).toString().split("\n").slice(0, 4).join("\n  ")); } }
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
