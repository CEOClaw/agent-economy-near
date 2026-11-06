// Archives a URL once: bytes + metadata under data/backtest/archive/<sha256>.txt and .meta.json, indexed by URL in index.json.
// An archived page is the source of truth for urls-resolve and quotes-in-source, so a page that changes later cannot move a verdict.
//   node scripts/pack-archive.mjs <url> [--force] [--dir <archive dir>]
//   node scripts/pack-archive.mjs <url> --from-file <path> [--status 200]   (origin "mock": bytes you supply, labelled as such)
// Non-2xx answers are archived too, with their status, so "does not resolve" is a recorded fact.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."), MAX = 2 * 1024 * 1024;
const a = process.argv.slice(2), opt = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null), url = a[0];
if (!url || url.startsWith("--")) { console.error("usage: node scripts/pack-archive.mjs <url> [--force] [--from-file <path> [--status N]] [--dir <dir>]"); process.exit(2); }
const dir = resolve(opt("--dir") || join(ROOT, "data/backtest/archive")), idxPath = join(dir, "index.json");
mkdirSync(dir, { recursive: true });
const index = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, "utf8")) : {};
if (index[url] && !a.includes("--force")) { console.log(`already archived: ${index[url].file} (use --force to refetch)`); process.exit(0); }

let bytes, status, origin, contentType = null;
if (opt("--from-file")) { bytes = readFileSync(opt("--from-file")); status = Number(opt("--status") || 200); origin = "mock"; }
else {
  const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "agentproof-pack-archive/1" } });
  bytes = Buffer.from(await res.arrayBuffer()); status = res.status; origin = "real-fetch"; contentType = res.headers.get("content-type");
}
if (bytes.length > MAX) { console.error(`refusing: ${bytes.length} bytes exceeds the ${MAX} byte archive limit`); process.exit(1); }
const sha = createHash("sha256").update(bytes).digest("hex"), rec = { url, file: `backtest/archive/${sha}.txt`, sha256: sha, bytes: bytes.length, fetched_at: new Date().toISOString().replace(/\.\d+Z/, "Z"), http_status: status, origin, content_type: contentType };
writeFileSync(join(dir, `${sha}.txt`), bytes);
writeFileSync(join(dir, `${sha}.meta.json`), JSON.stringify(rec, null, 2) + "\n");
index[url] = rec;
writeFileSync(idxPath, JSON.stringify(Object.fromEntries(Object.entries(index).sort()), null, 2) + "\n");
console.log(`archived ${url}: HTTP ${status}, ${bytes.length} bytes, sha256 ${sha.slice(0, 12)}..., ${relative(ROOT, join(dir, sha + ".txt"))}`);
