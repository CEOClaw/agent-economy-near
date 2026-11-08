#!/usr/bin/env bash
# Export one NEAR market job that ran through ohwow into a Proof Town run bundle.
# Needs a checkout of ohwow.fun with database access (OHWOW_FUN_DIR, default ~/work/ohwow/ohwow.fun).
# Account ids are stripped. Review the file before committing it.
#   scripts/export-ohwow-market-job.sh <market_job_id> > data/runs/market-<short>.json
set -euo pipefail
JOB="${1:?usage: $0 <market_job_id>}"; [[ "$JOB" =~ ^[0-9a-f-]{36}$ ]] || { echo "not a job id: $JOB" >&2; exit 2; }
DIR="${OHWOW_FUN_DIR:-$HOME/work/ohwow/ohwow.fun}"; cd "$DIR"
q() { npx tsx scripts/query.ts --json "$1" 2>/dev/null; }
HIRE=$(q "SELECT id, listing_id, task_id, current_task_id, extracted_input->>'envelope' AS envelope, job_ref FROM marketplace_hires WHERE job_id='$JOB'")
LISTING=$(echo "$HIRE" | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r[0]["listing_id"] if r else "")')
[ -n "$LISTING" ] || { echo "no hire found for job $JOB" >&2; exit 1; }
EVENTS=$(q "SELECT event, received_at, processed_at FROM marketplace_events WHERE listing_id='$LISTING' AND payload->>'job_id'='$JOB' ORDER BY received_at")
TASKS=$(echo "$HIRE" | python3 -c 'import json,sys; r=json.load(sys.stdin)[0]; print(",".join("%s" % repr(t) for t in {r["task_id"], r["current_task_id"]} if t))')
TASKROWS=$(q "SELECT id, status, created_at, started_at, completed_at, cost_cents FROM agent_workforce_tasks WHERE id IN ($TASKS) ORDER BY created_at")
python3 - "$HIRE" "$EVENTS" "$TASKROWS" <<'PY'
import json, sys, datetime
hire, events, tasks = (json.loads(a or "[]") for a in sys.argv[1:4]); h = hire[0]; jr = h["job_ref"] or {}
jr.get("job", {}).pop("creator_account_id", None)
for k in ("owner_account_id", "market_agent_id"): jr.get("executor", {}).pop(k, None)
print(json.dumps({"schema": "agentproof-run-bundle-v0", "envelope": json.loads(h["envelope"]) if h.get("envelope") else None, "job_ref": jr,
  "events": events, "tasks": tasks, "self_hire": None,
  "provenance": {"source": "ohwow.fun production: marketplace_hires.job_ref, marketplace_events, agent_workforce_tasks", "read_at": datetime.date.today().isoformat(), "exported_by": "scripts/export-ohwow-market-job.sh"}}, indent=2, ensure_ascii=False))
PY
