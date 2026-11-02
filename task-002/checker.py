#!/usr/bin/env python3
"""
AgentProof Checker — structured-field-extraction-v1
Deterministic: same inputs always produce same output.

CLI:
    python3 checker.py <envelope.json> <delivery.json>

Prints a single JSON object to stdout:
    {
      "outcome":        "pass" | "fail" | "blocked",
      "evidence_digest": "<sha256hex>" | null,
      "failure_reason":  "<string>"    | null,
      "blocked_reason":  "<string>"    | null,
      "task_id":         "<string>",
      "checker_ref":     "structured-field-extraction-v1:1.0.0"
    }

Exit codes: 0 always (outcome is in the JSON, not the exit code).
"""

import sys
import json
import hashlib

CHECKER_REF = "structured-field-extraction-v1:1.0.0"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def canonical_json(obj) -> str:
    """Canonical JSON — sort_keys, no spaces, ASCII-safe."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def parse_fields(input_text: str) -> dict:
    """
    Split input_text on newlines; split each line on the FIRST ': ' (colon-space);
    strip leading/trailing whitespace from both key and value.
    Lines that contain no ': ' separator are silently skipped.
    """
    fields: dict = {}
    for raw_line in input_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if ": " not in line:
            continue
        key, value = line.split(": ", 1)
        fields[key.strip()] = value.strip()
    return fields


def compute_evidence_digest(
    task_id: str,
    executor_agent_id: str,
    input_text: str,
    extracted: dict,
) -> str:
    """
    sha256( task_id + "|" + executor_agent_id + "|" + input_text + "|" + canonical(extracted) )
    Encoded as UTF-8 before hashing.
    """
    canonical = canonical_json(extracted)
    raw = task_id + "|" + executor_agent_id + "|" + input_text + "|" + canonical
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Core checker
# ---------------------------------------------------------------------------

def check(envelope: dict, delivery: dict) -> dict:
    """
    Validate a delivery against its task envelope.
    Returns the checker result dict (never raises).
    """
    task_id: str = envelope.get("task_id", "")

    # ------------------------------------------------------------------
    # Helpers for uniform result construction
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
    # Step 0: Blocked conditions — spend gate or executor self-report
    # ------------------------------------------------------------------
    if delivery.get("blocked") is True:
        req_spend = delivery.get("requested_spend_usdc")
        max_spend = envelope.get("max_spend_usdc")
        if (
            req_spend is not None
            and max_spend is not None
            and float(req_spend) > float(max_spend)
        ):
            reason = delivery.get(
                "blocked_reason",
                f"spend_gate: executor requested {req_spend} USDC; "
                f"envelope max_spend_usdc is {max_spend} USDC",
            )
            return _blocked(reason)
        # Generic blocked (no spend data → take the delivery's own reason)
        return _blocked(
            delivery.get("blocked_reason", "executor reported blocked; no spend data supplied")
        )

    # ------------------------------------------------------------------
    # Step 1: Schema field
    # ------------------------------------------------------------------
    if delivery.get("schema") != "agentproof-extraction-v1":
        return _fail("schema field missing or wrong value")

    # ------------------------------------------------------------------
    # Step 2: task_id echo
    # ------------------------------------------------------------------
    if delivery.get("task_id") != task_id:
        return _fail(
            f"task_id mismatch: expected '{task_id}', got '{delivery.get('task_id')}'"
        )

    # ------------------------------------------------------------------
    # Step 3: extracted object present and is a dict
    # ------------------------------------------------------------------
    if "extracted" not in delivery:
        return _fail("missing extracted object")

    extracted = delivery["extracted"]
    if not isinstance(extracted, dict):
        return _fail("extracted is not a JSON object")

    # ------------------------------------------------------------------
    # Step 4: Parse ground-truth values from input_text
    # ------------------------------------------------------------------
    input_text: str = envelope.get("input_text", "")
    expected: dict = parse_fields(input_text)
    required_fields: list = envelope.get("required_fields", [])

    # ------------------------------------------------------------------
    # Step 5: Required-field presence and value match
    # ------------------------------------------------------------------
    for field in required_fields:
        if field not in extracted:
            return _fail(f"missing required field: {field}")

        actual = str(extracted[field]).strip()
        expected_val = expected.get(field, "")

        if actual != expected_val:
            return _fail(
                f"field {field}: expected '{expected_val}', got '{actual}'"
            )

    # ------------------------------------------------------------------
    # Step 6: No unexpected extra fields
    # ------------------------------------------------------------------
    extra = set(extracted.keys()) - set(required_fields)
    if extra:
        return _fail(f"unexpected extra fields: {sorted(extra)}")

    # ------------------------------------------------------------------
    # Step 7: All checks passed — compute deterministic evidence digest
    # ------------------------------------------------------------------
    executor_agent_id: str = delivery.get("executor_agent_id", "")
    evidence_digest = compute_evidence_digest(
        task_id, executor_agent_id, input_text, extracted
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
            "Usage: python3 checker.py <envelope.json> <delivery.json>",
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
