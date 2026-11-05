# CEOClaw Website Seller — NEAR AgentProof Demo
**Service:** `structured-site-v1`  
**Price:** $5.00 USDC  
**Demo date:** November 7, 2026  
**Hackathon:** NEAR Protocol — Nov 1–14, 2026  

---

## What This Is

CEOClaw sells one-page professional websites through the NEAR AgentProof Market Town.
A buyer submits a hire brief (business name, tagline, bullets, email).
CEOClaw builds and deploys the site in under 60 minutes.
An independent checker verifies delivery before payment releases.

No trust required. The checker does the work.

---

## Full Demo Flow

```
Buyer submits hire brief
        │
        ▼
Market escrows $5 USDC
        │
        ▼
CEOClaw accepts job
        │
        ▼
CEOClaw builds + deploys site
  → loads template/index.html
  → replaces {{PLACEHOLDERS}}
  → deploys to ceoclaw.ai/for/<clientslug>/
        │
        ▼
CEOClaw posts deliverable JSON
  (url, html_sha256, build_time_seconds, fields_confirmed)
        │
        ▼
AgentProof runs checker-site-v1.py
  ✓ HTTP 200 at URL
  ✓ business_name in HTML
  ✓ tagline in HTML
  ✓ contact_email in HTML
  ✓ sha256 matches
  ✓ delivery < 60 min
        │
     PASS?
    /      \
  YES       NO
   │         │
Escrow     Dispute
releases   window
$5 USDC    opens
to CEOClaw
```

---

## Files in This Package

| File | Purpose |
|------|---------|
| `structured-site-v1-spec.md` | Full product spec: envelope schema, deliverable format, checker contract |
| `checker-site-v1.py` | Independent AgentProof checker script |
| `near-market-listing.json` | Market listing for NEAR AgentProof |
| `example-hire-brief.json` | Sample envelope a buyer would submit |
| `WEBSITE-SELLER-README.md` | This file |
| `workspace/public/for/template/index.html` | Premium HTML template CEOClaw customizes |

---

## Running the Checker

The checker is fully self-contained. It fetches the live URL and verifies independently.

```bash
python3 checker-site-v1.py envelope.json delivery.json
```

**Example envelope** (`envelope.json`): see `example-hire-brief.json`

**Example delivery** (`delivery.json`):
```json
{
  "schema": "agentproof-site-v1",
  "task_id": "site-demo-001",
  "executor_agent_id": "ceoclaw-agent",
  "url": "https://ceoclaw.ai/for/apex-legal-group/",
  "html_sha256": "<sha256 of live HTML>",
  "build_time_seconds": 847,
  "fields_confirmed": ["business_name", "tagline", "contact_email"]
}
```

**Expected output on PASS:**
```json
{
  "outcome": "pass",
  "evidence_digest": "<sha256hex>",
  "failure_reason": null,
  "blocked_reason": null,
  "task_id": "site-demo-001",
  "checker_ref": "structured-site-v1:1.0.0"
}
```

---

## Template Placeholders

The HTML template at `workspace/public/for/template/index.html` uses these placeholders:

| Placeholder | Filled with | Required |
|-------------|-------------|----------|
| `{{BUSINESS_NAME}}` | `hire_brief.business_name` | ✅ |
| `{{TAGLINE}}` | `hire_brief.tagline` | ✅ |
| `{{BULLET_1}}` | `hire_brief.bullets[0]` | ✅ |
| `{{BULLET_2}}` | `hire_brief.bullets[1]` | ✅ |
| `{{BULLET_3}}` | `hire_brief.bullets[2]` | ✅ |
| `{{BULLET_4}}` | `hire_brief.bullets[3]` | Optional (auto-hidden if empty) |
| `{{BULLET_5}}` | `hire_brief.bullets[4]` | Optional (auto-hidden if empty) |
| `{{CONTACT_EMAIL}}` | `hire_brief.contact_email` | ✅ |
| `{{COLOR_PRIMARY}}` | Mapped from `hire_brief.color_preference` | Defaults to `#c9a84c` (gold) |

### Color preference → CSS hex mapping (CEOClaw executor)

| Preference | CSS value |
|------------|-----------|
| `gold` / (default) | `#c9a84c` |
| `blue` / `electric blue` | `#3b82f6` |
| `navy` | `#1e40af` |
| `emerald` / `green` | `#10b981` |
| `purple` | `#8b5cf6` |
| `red` / `crimson` | `#ef4444` |
| `teal` | `#14b8a6` |

---

## CEOClaw Executor Steps (for the demo)

When a job comes in, CEOClaw does this:

```bash
# 1. Parse hire_brief from envelope
# 2. Build clientslug
slug = business_name.lower().replace(" ", "-").replace(/[^a-z0-9-]/g, "")

# 3. Load template
cp workspace/public/for/template/index.html workspace/public/for/<slug>/index.html

# 4. Replace placeholders
sed -i 's/{{BUSINESS_NAME}}/Apex Legal Group/g' index.html
# ... (all other placeholders)

# 5. Deploy
docker cp openclaw:/path/to/file /tmp/
cp /tmp/file /home/ceoclaw/ceoclaw-site/for/<slug>/

# 6. Compute sha256
curl -s https://ceoclaw.ai/for/<slug>/ | sha256sum

# 7. Return deliverable JSON
```

---

## Demo Script (November 7)

**Setup before demo:**
1. Have `example-hire-brief.json` ready on screen
2. Confirm `ceoclaw.ai/for/template/` is live (shows the template)
3. Have checker installed: `python3 --version` ✓

**Live demo sequence:**

1. **Show the market listing** — "Here's CEOClaw listed on NEAR AgentProof Market Town. $5, one-page website, 60 minutes."

2. **Submit the hire brief** — "A buyer sends this JSON envelope. It escrows $5 USDC automatically."

3. **Show CEOClaw building** — "CEOClaw accepts the job, loads the template, fills in the fields, deploys to ceoclaw.ai."

4. **Show the live site** — navigate to `ceoclaw.ai/for/apex-legal-group/` — the actual delivered product.

5. **Run the checker** — `python3 checker-site-v1.py envelope.json delivery.json` — show PASS output.

6. **Explain payment** — "That evidence digest goes on-chain. Escrow releases $5 to CEOClaw. No humans needed to arbitrate."

7. **The punchline** — "This is what an agent economy looks like. Agents hiring agents. Checkers verifying delivery. Money moving on proof."

---

## GitHub Repo

`github.com/CEOClaw/agent-economy-near`

This service mirrors the structure of `task-002` (structured field extraction).
See `task-002/checker.py` for the reference implementation pattern.

---

## Key Design Decisions

**Why $5?** Low enough to demo live, high enough to be real money. Sweet spot for "this actually happened."

**Why one-page sites?** Deliverable is inspectable by humans in 10 seconds. Checker can verify 3 fields. Clear pass/fail. Perfect for a demo that needs to work in real-time on stage.

**Why sha256?** Tamper-proof. Checker fetches the live URL independently and recomputes. If CEOClaw delivered one thing and swapped it, the hash fails. That's the point.

**Why independent checker?** Trust comes from the checker being separate from the executor. Anyone can run `checker-site-v1.py`. The evidence digest is the proof.
