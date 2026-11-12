// Minimal MCP client (Streamable HTTP) for READING a job on NEAR Agent Market. Zero dependencies: fetch only.
// Nothing runs on import. Read-only use by scripts/gate.mjs and scripts/export-market-hire.mjs (get_job, get_job_status, get_job_result,
// list_my_jobs): no write tool is called from this repo.
// The buyer accepts or sends back by hand on market.near.ai. Endpoint: https://market.near.ai/mcp.
// Token: opts.token, else MARKET_MCP_TOKEN, else the token file written by scripts/market-login.mjs. Never logged.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const BASE = "https://market.near.ai";
export const TOKEN_FILE = path.join(os.homedir(), ".agentproof", "market-token.json");

// Thrown for a tool refusal (isError result) and for a JSON-RPC error. `code` is the market's number (-32001 nothing awaits a decision,
// -32003 not your job, -32005 agent halted, -32602 bad args, -32603 market failure); `kind` says which of the two it was.
export class McpError extends Error {
  constructor(message, { code = null, kind = "rpc", data = null, tool = null } = {}) { super(message); this.name = "McpError"; this.code = code; this.kind = kind; this.data = data; this.tool = tool; }
}

function readToken(opts) {
  if (opts.token) return opts.token;
  if (process.env.MARKET_MCP_TOKEN) return process.env.MARKET_MCP_TOKEN;
  try { const t = JSON.parse(fs.readFileSync(opts.tokenFile || TOKEN_FILE, "utf8")); if (t.access_token) return t.access_token; } catch {}
  throw new McpError("no market token: set MARKET_MCP_TOKEN or run scripts/market-login.mjs", { kind: "auth" });
}

// An SSE body is lines "data: {json}" separated by blank lines; take the JSON-RPC message that has our id (else the last one).
export function parseBody(text, contentType, id) {
  if (/text\/event-stream/i.test(contentType || "")) {
    const msgs = [];
    for (const ev of text.split(/\r?\n\r?\n/)) {
      const data = ev.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
      if (data) { try { msgs.push(JSON.parse(data)); } catch {} }
    }
    return msgs.find((m) => m.id === id) || msgs[msgs.length - 1];
  }
  return text.trim() ? JSON.parse(text) : undefined;
}

// One session: initialize, then tools/call. opts: {token, tokenFile, fetchFn, base}.
export function createClient(opts = {}) {
  const fetchFn = opts.fetchFn || fetch, url = (opts.base || BASE) + "/mcp";
  let sid = null, seq = 0, ready = null;
  async function post(body, wantReply = true) {
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer " + readToken(opts) };
    if (sid) headers["mcp-session-id"] = sid;
    const res = await fetchFn(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    const got = res.headers?.get?.("mcp-session-id"); if (got) sid = got;
    if (res.status === 401 || res.status === 403) throw new McpError(`market refused the token (HTTP ${res.status}): run scripts/market-login.mjs (or --refresh)`, { kind: "auth", code: res.status });
    if (!res.ok) throw new McpError(`market MCP answered HTTP ${res.status}`, { kind: "http", code: res.status });
    if (!wantReply) return undefined;
    const msg = parseBody(await res.text(), res.headers?.get?.("content-type"), body.id);
    if (!msg) throw new McpError("market MCP sent no JSON-RPC reply", { kind: "http" });
    if (msg.error) throw new McpError(msg.error.message || "market MCP error", { code: msg.error.code, kind: "rpc", data: msg.error.data });
    return msg.result;
  }
  const init = () => ready ||= (async () => {
    await post({ jsonrpc: "2.0", id: ++seq, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "agentproof-gate", version: "1" } } });
    await post({ jsonrpc: "2.0", method: "notifications/initialized" }, false);
  })();
  return {
    url,
    async call(tool, args) {
      await init();
      const result = await post({ jsonrpc: "2.0", id: ++seq, method: "tools/call", params: { name: "marketplace__" + tool, arguments: args } });
      const text = (result?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
      let value = result?.structuredContent;
      if (value === undefined && text) { try { value = JSON.parse(text); } catch { value = text; } }
      if (result?.isError) {
        const v = value && typeof value === "object" ? value : {};
        throw new McpError(v.message || (typeof value === "string" ? value : `${tool} refused`), { code: v.code ?? null, kind: "refused", data: v.data ?? null, tool });
      }
      return value;
    },
  };
}
const clientFor = (opts) => opts.client || createClient(opts);

export const getJobStatus = (jobId, opts = {}) => clientFor(opts).call("get_job_status", { job_id: jobId });
// {job_id, title, status, created_at, updated_at, budget_amount, token, ...}. The market reports no accept time anywhere on MCP:
// updated_at is when the job last changed, which for a completed job is when the buyer accepted (equal to the REST assignment
// finalizedAt on job 8a20efe5, read 2026-11-11).
export const getJob = (jobId, opts = {}) => clientFor(opts).call("get_job", { job_id: jobId });
// {jobs: [{job_id, status, assignment_status, awarded_at, finished_at, worker: {handle, ...}, ...}], total}: the buyer's own jobs.
export const listMyJobs = (opts = {}) => clientFor(opts).call("list_my_jobs", {});

// Reads every page of a delivered result. Returns {status:"delivered", content, bytes_total, assignment_id, version, awaiting_acceptance}
// | {status:"external", deliverable_url} | {status:"unavailable", note}. Refuses a page loop that does not advance or a result that comes up short.
export async function getJobResult(jobId, opts = {}) {
  const client = clientFor(opts);
  let offset, content = "", first;
  for (let i = 0; i < 200; i++) {
    const r = await client.call("get_job_result", offset === undefined ? { job_id: jobId } : { job_id: jobId, offset });
    if (r?.status !== "delivered") return r;
    first ||= r;
    content += r.content_chunk ?? "";
    if (r.next_offset === undefined || r.next_offset === null) {
      const { content_chunk, next_offset, ...rest } = first;
      if (typeof rest.bytes_total === "number" && Buffer.byteLength(content) !== rest.bytes_total) throw new McpError(`result of ${jobId} came back ${Buffer.byteLength(content)} bytes, the market says ${rest.bytes_total}`, { kind: "short", tool: "get_job_result" });
      return { ...rest, content };
    }
    if (typeof r.next_offset !== "number" || r.next_offset === offset) throw new McpError("result paging did not advance", { kind: "paging", tool: "get_job_result" });
    offset = r.next_offset;
  }
  throw new McpError("result has too many pages", { kind: "paging", tool: "get_job_result" });
}
