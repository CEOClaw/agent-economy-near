// One-time OAuth login so scripts/gate.mjs can READ job status and delivery (no write tool is called from this repo). RUN ONLY ON THE OPERATOR'S GO: it is not part of any test or CI.
// What it creates on the market: (1) an OAuth client registration ("agentproof-gate", public client, redirect http://127.0.0.1:<port>/callback)
// and (2) an access + refresh token for the person who signs in at the consent page, scoped to the MCP resource /mcp.
// What it changes locally: writes ~/.agentproof/market-token.json (mode 0600, outside the repo). Revoke under Hiring > Connections > MCP clients.
// Usage: node scripts/market-login.mjs              log in (opens the browser, you approve once)
//        node scripts/market-login.mjs --refresh    swap the refresh token for a new access token
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { BASE, TOKEN_FILE } from "./market-mcp.mjs";

const b64u = (b) => Buffer.from(b).toString("base64url");
const getJson = async (url, init) => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let j; try { j = JSON.parse(text); } catch { j = null; }
  if (!res.ok || !j) throw new Error(`${url} answered HTTP ${res.status}: ${(j && (j.error_description || j.error)) || text.slice(0, 200)}`);
  return j;
};
const post = (url, body, form) => getJson(url, form
  ? { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams(body).toString() }
  : { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });

function save(tok, extra) {
  const dir = path.dirname(TOKEN_FILE);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const rec = { ...extra, access_token: tok.access_token, refresh_token: tok.refresh_token || extra.refresh_token, expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null, saved_at: new Date().toISOString() };
  if (!rec.access_token) throw new Error("the token endpoint sent no access_token");
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(rec, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(TOKEN_FILE, 0o600); // mode only applies when the file is created; fix an older one too
}

async function refresh() {
  const t = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  if (!t.refresh_token) throw new Error("no refresh token saved: log in again");
  const tok = await post(t.token_endpoint, { grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.client_id, resource: t.resource }, true);
  save(tok, t);
  console.log("refreshed; token file updated (" + TOKEN_FILE + ")");
}

async function login() {
  const resource = BASE + "/mcp";
  // discovery: the protected resource names its authorization server, whose metadata names the endpoints
  const pr = await getJson(BASE + "/.well-known/oauth-protected-resource");
  const issuer = (pr.authorization_servers && pr.authorization_servers[0]) || BASE;
  const meta = await getJson(issuer.replace(/\/$/, "") + "/.well-known/oauth-authorization-server");
  const regUrl = meta.registration_endpoint || BASE + "/oauth/register";
  if (!meta.authorization_endpoint || !meta.token_endpoint) throw new Error("authorization server metadata lacks authorization_endpoint or token_endpoint");

  const verifier = b64u(crypto.randomBytes(32)), challenge = b64u(crypto.createHash("sha256").update(verifier).digest()), state = b64u(crypto.randomBytes(16));
  // the loopback listener first: dynamic registration needs the redirect URI
  let finish; const codeP = new Promise((res, rej) => { finish = { res, rej }; });
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.pathname !== "/callback") { res.writeHead(404).end(); return; }
    const ok = u.searchParams.get("state") === state && u.searchParams.get("code");
    res.writeHead(ok ? 200 : 400, { "content-type": "text/plain" }).end(ok ? "Signed in. You can close this tab." : "Sign-in failed: " + (u.searchParams.get("error") || "bad state"));
    ok ? finish.res(u.searchParams.get("code")) : finish.rej(new Error("authorization failed: " + (u.searchParams.get("error") || "state mismatch")));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const redirect = `http://127.0.0.1:${server.address().port}/callback`;
  try {
    const reg = await post(regUrl, { client_name: "agentproof-gate", redirect_uris: [redirect], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" });
    const q = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: "S256", state, resource });
    const authUrl = meta.authorization_endpoint + "?" + q;
    console.log("Open this URL and approve (as yourself, the buyer):\n" + authUrl);
    try { spawn("open", [authUrl], { stdio: "ignore", detached: true }).on("error", () => {}).unref(); } catch {}
    const timer = setTimeout(() => finish.rej(new Error("no approval within 5 minutes")), 300000);
    const code = await codeP; clearTimeout(timer);
    const tok = await post(meta.token_endpoint, { grant_type: "authorization_code", code, redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier, resource }, true);
    save(tok, { client_id: reg.client_id, token_endpoint: meta.token_endpoint, resource });
    console.log(`logged in for ${resource}; token saved to ${TOKEN_FILE} (mode 0600)`);
  } finally { server.close(); }
}

const args = process.argv.slice(2);
(args.includes("--refresh") ? refresh() : login()).catch((e) => { console.error("market-login failed: " + e.message); process.exit(1); });
