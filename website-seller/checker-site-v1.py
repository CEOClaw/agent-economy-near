#!/usr/bin/env python3
"""
AgentProof Checker — structured-site-v1
Deterministic: same inputs always produce same output.

CLI:
    python3 checker-site-v1.py <envelope.json> <delivery.json>

Prints a single JSON object to stdout:
    {
      "outcome":         "pass" | "fail" | "blocked",
      "evidence_digest": "<sha256hex>" | null,
      "failure_reason":  "<string>"    | null,
      "blocked_reason":  "<string>"    | null,
      "task_id":         "<string>",
      "checker_ref":     "structured-site-v1:1.0.0"
    }

Exit codes: 0 always (outcome is in the JSON, not the exit code).

Verification steps (all must pass for "pass"):
  1. Blocked gate   — executor self-reported blocked → outcome blocked
  2. Schema         — delivery.schema == "agentproof-site-v1"
  3. task_id echo   — delivery.task_id == envelope.task_id
  4. Build time     — delivery.build_time_seconds <= envelope.max_delivery_seconds
  5. HTTP 200       — GET delivery.url returns HTTP 200
  6. Field presence — business_name, tagline, contact_email in HTML (case-insensitive)
  7. SHA-256 match  — sha256(fetched HTML) == delivery.html_sha256
  8. Evidence digest computed and returned
"""

import sys
import json
import hashlib
import urllib.request
import urllib.error

CHECKER_REF = "structured-site-v1:1.0.0"
REQUIRED_FIELDS = ["business_name", "tagline", "contact_email"]
FETCH_TIMEOUT_SECONDS = 20


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def canonical_json(obj) -> str:
    """Canonical JSON — sort_keys, no spaces, ASCII-safe."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def fetch_html(url: str) -> tuple:
    """
    Fetch URL. Returns (status_code, html_bytes, error_string).
    On network error: status_code=0, html_bytes=None, error_string=<msg>.
    """
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "AgentProof-Checker/1.0 structured-site-v1"},
        )
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_SECONDS) as resp:
            return resp.status, resp.read(), None
    except urllib.error.HTTPError as exc:
        return exc.code, None, f"HTTP error {exc.code}: {exc.reason}"
    except urllib.error.URLError as exc:
        return 0, None, f"URL error: {exc.reason}"
    except Exception as exc:  # noqa: BLE001
        return 0, None, f"fetch error: {exc}"


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compute_evidence_digest(
    task_id: str,
    executor_agent_id: str,
    url: str,
    html_sha256: str,
) -> str:
    """
    sha256( task_id + "|" + executor_agent_id + "|" + url + "|" + html_sha256 )
    Encoded as UTF-8 before hashing.
    """
    raw = task_id + "|" + executor_agent_id + "|" + url + "|" + html_sha256
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def field_in_html(field_value: str, html_text: str) -> bool:
    """Case-insensitive substring check."""
    return field_value.lower() in html_text.lower()


# ---------------------------------------------------------------------------
# Core checker
# ---------------------------------------------------------------------------

def check(envelope: dict, delivery: dict) -> dict:
    """
    Validate a website delivery against its task envelope.
    Returns the checker result dict (never raises).
    """
    task_id: str = envelope.get("task_id", "")

    # ------------------------------------------------------------------
    # Uniform result constructors
    # ------------------------------------------------------------------
    def _fail(reason: str) -> dict:
        return {
            "outcome": "fail",
            "evidence_digest": None,
            "failure_reason": reason,
            "blocked_reason": None,
            "task_id": task_id,
            "checker_ref": CHECKER_REF,
        }

    def _blocked(reason: str) -> dict:
        return {
            "outcome": "blocked",
            "evidence_digest": None,
            "failure_reason": None,
            "blocked_reason": reason,
            "task_id": task_id,
            "checker_ref": CHECKER_REF,
        }

    # ------------------------------------------------------------------
    # Step 0: Blocked gate — executor self-report
    # ------------------------------------------------------------------
    if delivery.get("blocked") is True:
        return _blocked(
            delivery.get("blocked_reason", "executor reported blocked")
        )

    # ------------------------------------------------------------------
    # Step 1: Schema validation
    # ------------------------------------------------------------------
    if delivery.get("schema") != "agentproof-site-v1":
        return _fail(
            f"schema_invalid: expected 'agentproof-site-v1', "
            f"got '{delivery.get('schema')}'"
        )

    # ------------------------------------------------------------------
    # Step 2: task_id echo
    # ------------------------------------------------------------------
    if delivery.get("task_id") != task_id:
        return _fail(
            f"task_id_mismatch: expected '{task_id}', "
            f"got '{delivery.get('task_id')}'"
        )

    # ------------------------------------------------------------------
    # Step 3: Build time within envelope limit
    # ------------------------------------------------------------------
    max_delivery = envelope.get("max_delivery_seconds", 3600)
    build_time = delivery.get("build_time_seconds")
    if build_time is None:
        return _fail("delivery_timeout: build_time_seconds missing from delivery")
    if int(build_time) > int(max_delivery):
        return _fail(
            f"delivery_timeout: build_time_seconds {build_time} "
            f"exceeds max {max_delivery}"
        )

    # ------------------------------------------------------------------
    # Step 4: URL present and reachable (HTTP 200)
    # ------------------------------------------------------------------
    url: str = delivery.get("url", "").strip()
    if not url:
        return _fail("http_not_200: delivery.url is missing or empty")

    status_code, html_bytes, fetch_err = fetch_html(url)

    if fetch_err and status_code == 0:
        return _blocked(f"network error fetching delivery URL: {fetch_err}")

    if status_code != 200:
        return _fail(
            f"http_not_200: GET {url} returned HTTP {status_code}"
            + (f" — {fetch_err}" if fetch_err else "")
        )

    html_text: str = html_bytes.decode("utf-8", errors="replace")

    # ------------------------------------------------------------------
    # Step 5: Required field presence in HTML
    # ------------------------------------------------------------------
    hire_brief: dict = envelope.get("hire_brief", {})

    checks = [
        ("business_name", hire_brief.get("business_name", "")),
        ("tagline",       hire_brief.get("tagline", "")),
        ("contact_email", hire_brief.get("contact_email", "")),
    ]

    for field_name, field_value in checks:
        if not field_value:
            return _blocked(
                f"envelope hire_brief missing required field: {field_name}"
            )
        if not field_in_html(field_value, html_text):
            return _fail(
                f"{field_name}_missing: '{field_value}' not found in delivered HTML"
            )

    # ------------------------------------------------------------------
    # Step 6: SHA-256 match
    # ------------------------------------------------------------------
    declared_sha256: str = delivery.get("html_sha256", "").strip().lower()
    if not declared_sha256:
        return _fail("sha256_mismatch: delivery.html_sha256 missing or empty")

    actual_sha256: str = sha256_hex(html_bytes)

    if actual_sha256 != declared_sha256:
        return _fail(
            f"sha256_mismatch: declared {declared_sha256[:16]}…, "
            f"fetched {actual_sha256[:16]}…"
        )

    # ------------------------------------------------------------------
    # Step 7: All checks passed — compute deterministic evidence digest
    # ------------------------------------------------------------------
    executor_agent_id: str = delivery.get("executor_agent_id", "ceoclaw-agent")
    evidence_digest = compute_evidence_digest(
        task_id, executor_agent_id, url, actual_sha256
    )

    return {
        "outcome": "pass",
        "evidence_digest": evidence_digest,
        "failure_reason": None,
        "blocked_reason": None,
        "task_id": task_id,
        "checker_ref": CHECKER_REF,
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _load_json_file(path: str, label: str) -> tuple:
    """Returns (data, error_string). One of the two will be None."""
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh), None
    except FileNotFoundError:
        return None, f"file not found: {path}"
    except json.JSONDecodeError as exc:
        return None, f"{label} is not valid JSON: {exc}"
    except OSError as exc:
        return None, f"could not read {label}: {exc}"


def main() -> None:
    if len(sys.argv) != 3:
        print(
            "Usage: python3 checker-site-v1.py <envelope.json> <delivery.json>",
            file=sys.stderr,
        )
        sys.exit(1)

    envelope_path = sys.argv[1]
    delivery_path = sys.argv[2]

    envelope, err = _load_json_file(envelope_path, "envelope")
    if err:
        result = {
            "outcome": "blocked",
            "evidence_digest": None,
            "failure_reason": None,
            "blocked_reason": f"could not load envelope: {err}",
            "task_id": "",
            "checker_ref": CHECKER_REF,
        }
        print(json.dumps(result, indent=2))
        return

    delivery, err = _load_json_file(delivery_path, "delivery")
    if err:
        result = {
            "outcome": "blocked",
            "evidence_digest": None,
            "failure_reason": None,
            "blocked_reason": f"could not load delivery: {err}",
            "task_id": envelope.get("task_id", ""),
            "checker_ref": CHECKER_REF,
        }
        print(json.dumps(result, indent=2))
        return

    result = check(envelope, delivery)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
