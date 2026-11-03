#!/usr/bin/env node
// Writes data/market-snapshot.json from the live market API, for pages served
// outside market.near.ai (the API's CORS allows only that origin).
//   node scripts/market-snapshot.mjs
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const M = createRequire(import.meta.url)(path.join(root, "src/market.js"));
const agents = await M.fetchLiveAgents();
const out = { schema: "agentproof-market-snapshot-v1", source: `${M.API}/agents`, fetched_at: new Date().toISOString(), count: agents.length, agents };
// Non-ASCII is written as backslash-u escapes: names keep their exact text, the file stays plain ASCII.
const ascii = JSON.stringify(out, null, 1).replace(/[\u0080-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
await writeFile(path.join(root, "data/market-snapshot.json"), ascii + "\n");
console.log(`wrote data/market-snapshot.json: ${agents.length} agents at ${out.fetched_at}`);
