// Minimal NEAR signer + RPC caller for the gate's record_decision. Zero dependencies: node:crypto ed25519 + fetch.
// Nothing here runs on import. callMethod SENDS a real transaction: only scripts/gate.mjs --execute calls it.
// The key file is read only by loadKey and its secret is never logged or put in an error message.
import crypto from "node:crypto";
import fs from "node:fs";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58encode(buf) {
  let n = 0n; for (const b of buf) n = (n << 8n) | BigInt(b);
  let s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b === 0) s = "1" + s; else break; }
  return s;
}
export function b58decode(str) {
  let n = 0n;
  for (const c of str) { const i = B58.indexOf(c); if (i < 0) throw new Error("bad base58 character"); n = n * 58n + BigInt(i); }
  const bytes = []; while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  let z = 0; for (const c of str) { if (c === "1") z++; else break; }
  return Buffer.from([...new Array(z).fill(0), ...bytes]);
}
const stripKey = (s) => { if (!/^ed25519:/.test(s)) throw new Error("only ed25519 keys are supported"); return b58decode(s.slice(8)); };

// near-credentials JSON: {account_id, public_key:"ed25519:..", private_key:"ed25519:.."}; private_key is 64 bytes (seed + public) or just the 32-byte seed.
// near-cli-rs writes <account>.json without account_id (its implicit_account_id is a different account), so the caller names the
// account; a wrong one fails at the chain's access-key lookup before anything is signed.
export function loadKey(file, accountIdIfMissing) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const accountId = j.account_id ?? accountIdIfMissing, pub = j.public_key, priv = j.private_key || j.secret_key;
  if (typeof accountId !== "string" || typeof pub !== "string" || typeof priv !== "string") throw new Error(`key file ${file} is not a near-credentials JSON`);
  const sk = stripKey(priv), pk = stripKey(pub);
  if (sk.length !== 64 && sk.length !== 32) throw new Error("key file secret has the wrong length");
  if (pk.length !== 32) throw new Error("key file public key has the wrong length");
  const seed = sk.subarray(0, 32);
  // refuse a key file whose secret does not belong to its public key: signing with it would only fail later on chain
  const derived = crypto.createPublicKey(privKeyObject(seed)).export({ format: "der", type: "spki" }).subarray(-32);
  if (!derived.equals(pk)) throw new Error("key file secret does not match its public key");
  return { accountId, publicKey: pub, secretKey: "ed25519:" + b58encode(Buffer.concat([seed, pk])) };
}

// A KeyObject from the 32-byte seed: PKCS8 prefix for ed25519 + seed.
const PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
function privKeyObject(seed) { return crypto.createPrivateKey({ key: Buffer.concat([PKCS8, seed]), format: "der", type: "pkcs8" }); }
const SPKI = Buffer.from("302a300506032b6570032100", "hex");
export function verifySig(bytes, signature, publicKey) {
  const pub = crypto.createPublicKey({ key: Buffer.concat([SPKI, stripKey(publicKey)]), format: "der", type: "spki" });
  return crypto.verify(null, crypto.createHash("sha256").update(bytes).digest(), pub, stripKey(signature));
}

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const u128 = (n) => { const b = Buffer.alloc(16); let v = BigInt(n); for (let i = 0; i < 16; i++) { b[i] = Number(v & 255n); v >>= 8n; } return b; };
const str = (s) => { const d = Buffer.from(s, "utf8"); return Buffer.concat([u32(d.length), d]); };

// Borsh Transaction with one FunctionCall action. `args` is an object (JSON-encoded) or bytes; blockHash is base58.
export function buildFunctionCall({ signerId, publicKey, nonce, receiverId, blockHash, methodName, args, gas = "30000000000000", deposit = "0" }) {
  const argBytes = Buffer.isBuffer(args) || args instanceof Uint8Array ? Buffer.from(args) : Buffer.from(JSON.stringify(args));
  const bh = b58decode(blockHash);
  if (bh.length !== 32) throw new Error("block hash must be 32 bytes");
  return Buffer.concat([
    str(signerId), Buffer.from([0]), stripKey(publicKey), u64(nonce), str(receiverId), bh,
    u32(1), Buffer.from([2]), str(methodName), u32(argBytes.length), argBytes, u64(gas), u128(deposit),
  ]);
}
export const txHash = (bytes) => b58encode(crypto.createHash("sha256").update(bytes).digest());
export function sign(bytes, secretKey) {
  const seed = stripKey(secretKey).subarray(0, 32);
  const sig = crypto.sign(null, crypto.createHash("sha256").update(bytes).digest(), privKeyObject(seed));
  return Buffer.concat([bytes, Buffer.from([0]), sig]);
}

async function rpc(url, method, params, fetchFn) {
  const res = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "gate", method, params }), signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${method}: RPC ${url} answered HTTP ${res.status}`);
  return res.json();
}
// Try each RPC in order for reads. Only a transport failure moves to the next; an error the node reports is final.
async function rpcAny(urls, method, params, fetchFn) {
  let last;
  for (const u of urls) {
    try { const j = await rpc(u, method, params, fetchFn); return j; } catch (e) { last = e; }
  }
  throw new Error(`no RPC reachable for ${method}: ${last?.message}`);
}
const rpcList = (r) => (Array.isArray(r) ? r : [r]);

export async function viewMethod({ rpc: urls, contract, method, args = {}, fetchFn = fetch }) {
  const j = await rpcAny(rpcList(urls), "query", { request_type: "call_function", finality: "final", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") }, fetchFn);
  if (j.error) throw new Error(`view ${method} failed: ${JSON.stringify(j.error.data || j.error.message || j.error)}`);
  if (j.result?.error) throw new Error(`view ${method} failed: ${j.result.error}`);
  return JSON.parse(Buffer.from(j.result.result).toString("utf8"));
}

// Find the contract's panic text in a final outcome, if any.
function failureText(res) {
  const st = res?.status;
  if (st && st.Failure) return JSON.stringify(st.Failure.ActionError?.kind?.FunctionCallError?.ExecutionError ?? st.Failure);
  for (const r of res?.receipts_outcome || []) { const f = r.outcome?.status?.Failure; if (f) return f.ActionError?.kind?.FunctionCallError?.ExecutionError || JSON.stringify(f); }
  return null;
}

// Sign and send ONE function call and wait until FINAL. Returns {tx, block_height, outcome}; throws with the contract's panic text on failure.
// A send is never retried here: a lost reply could mean the tx landed, so the caller must look at get_decisions before trying again.
export async function callMethod({ rpc: urls, key, contract, method, args, gas, deposit, fetchFn = fetch }) {
  const list = rpcList(urls);
  const ak = await rpcAny(list, "query", { request_type: "view_access_key", finality: "final", account_id: key.accountId, public_key: key.publicKey }, fetchFn);
  if (ak.error || ak.result?.error) throw new Error(`access key lookup failed: ${JSON.stringify(ak.error?.data || ak.result?.error || ak.error)}`);
  const blk = await rpcAny(list, "block", { finality: "final" }, fetchFn);
  if (blk.error) throw new Error(`block lookup failed: ${JSON.stringify(blk.error)}`);
  const bytes = buildFunctionCall({ signerId: key.accountId, publicKey: key.publicKey, nonce: BigInt(ak.result.nonce) + 1n, receiverId: contract, blockHash: blk.result.header.hash, methodName: method, args, gas, deposit });
  const hash = txHash(bytes);
  const signed = sign(bytes, key.secretKey).toString("base64");
  const j = await rpc(list[0], "send_tx", { signed_tx_base64: signed, wait_until: "FINAL" }, fetchFn);
  if (j.error) throw new Error(`send_tx ${method} failed (tx ${hash}): ${JSON.stringify(j.error.data || j.error.cause || j.error.message || j.error)}`);
  const out = j.result, bad = failureText(out);
  if (bad) throw new Error(`${method} failed on chain (tx ${hash}): ${bad}`);
  const bh = out.transaction_outcome?.block_hash;
  let block_height = null;
  if (bh) { const b = await rpcAny(list, "block", { block_id: bh }, fetchFn); block_height = b.result?.header?.height ?? null; }
  return { tx: out.transaction?.hash || hash, block_height, outcome: out };
}

// Borsh Transaction with one DeployContract action (Action enum tag 1: u32 len + wasm bytes). Verified against the real deploy tx 4xnJEhK8...
export function buildDeploy({ signerId, publicKey, nonce, receiverId, blockHash, code }) {
  const bh = b58decode(blockHash);
  if (bh.length !== 32) throw new Error("block hash must be 32 bytes");
  const wasm = Buffer.from(code);
  if (wasm.length === 0) throw new Error("empty wasm");
  return Buffer.concat([str(signerId), Buffer.from([0]), stripKey(publicKey), u64(nonce), str(receiverId), bh, u32(1), Buffer.from([1]), u32(wasm.length), wasm]);
}
export const codeHash = (wasm) => b58encode(crypto.createHash("sha256").update(wasm).digest());

// Sign and send ONE DeployContract (signer deploys onto `contract`, which must be the signer's own account), wait until FINAL, then read
// view_account back and require its code_hash to equal base58(sha256(wasm)). Returns {tx, block_height, code_hash}. Never retried (see callMethod).
export async function deployContract({ rpc: urls, key, contract, wasmPath, fetchFn = fetch }) {
  const list = rpcList(urls);
  const code = fs.readFileSync(wasmPath), want = codeHash(code);
  const ak = await rpcAny(list, "query", { request_type: "view_access_key", finality: "final", account_id: key.accountId, public_key: key.publicKey }, fetchFn);
  if (ak.error || ak.result?.error) throw new Error(`access key lookup failed: ${JSON.stringify(ak.error?.data || ak.result?.error || ak.error)}`);
  const blk = await rpcAny(list, "block", { finality: "final" }, fetchFn);
  if (blk.error) throw new Error(`block lookup failed: ${JSON.stringify(blk.error)}`);
  const bytes = buildDeploy({ signerId: key.accountId, publicKey: key.publicKey, nonce: BigInt(ak.result.nonce) + 1n, receiverId: contract, blockHash: blk.result.header.hash, code });
  const hash = txHash(bytes);
  const signed = sign(bytes, key.secretKey).toString("base64");
  const j = await rpc(list[0], "send_tx", { signed_tx_base64: signed, wait_until: "FINAL" }, fetchFn);
  if (j.error) throw new Error(`send_tx deploy failed (tx ${hash}): ${JSON.stringify(j.error.data || j.error.cause || j.error.message || j.error)}`);
  const out = j.result, bad = failureText(out);
  if (bad) throw new Error(`deploy failed on chain (tx ${hash}): ${bad}`);
  const acct = await rpcAny(list, "query", { request_type: "view_account", finality: "final", account_id: contract }, fetchFn);
  if (acct.error || acct.result?.error) throw new Error(`deploy sent (tx ${hash}) but view_account failed: ${JSON.stringify(acct.error?.data || acct.result?.error || acct.error)}`);
  if (acct.result.code_hash !== want) throw new Error(`deploy sent (tx ${hash}) but on-chain code_hash ${acct.result.code_hash} != expected ${want}`);
  const bh = out.transaction_outcome?.block_hash;
  let block_height = null;
  if (bh) { const b = await rpcAny(list, "block", { block_id: bh }, fetchFn); block_height = b.result?.header?.height ?? null; }
  return { tx: out.transaction?.hash || hash, block_height, code_hash: acct.result.code_hash };
}
