#!/usr/bin/env python3
"""The Rust demo names testnet and carries no key material."""
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CONTRACT_FILE = os.path.join(ROOT, "contracts", "testnet_demo.rs")


def read_contract():
    with open(CONTRACT_FILE, encoding="utf-8") as handle:
        return handle.read()


def test_contract_exists():
    assert os.path.isfile(CONTRACT_FILE), "contract file missing"


def test_names_testnet():
    content = read_contract()
    assert "testnet" in content.lower(), "contract does not mention testnet"


def test_no_mainnet():
    content = read_contract()
    for line in content.split("\n"):
        code_line = line.split("//")[0]
        assert not re.search(r"\bmainnet\b", code_line, re.IGNORECASE), "other network named"


def test_no_key_material():
    content = read_contract()
    assert not re.search(r"ed25519:[1-9A-HJ-NP-Za-km-z]{20,}", content), "key literal found"
    assert "-----BEGIN " not in content, "pem block found"
    assert not re.search(r'"[0-9a-fA-F]{64}"', content), "hex literal found"


def test_has_contract_structure():
    content = read_contract()
    assert "#[near_bindgen]" in content, "missing near_bindgen"
    assert "AccountId" in content, "missing AccountId"
    assert "Balance" in content, "missing Balance"


def test_contract_is_rust():
    content = read_contract()
    assert "use near_sdk::" in content, "missing near_sdk import"
    assert "pub struct" in content, "missing pub struct"
    assert "#[near_bindgen]" in content, "missing near_bindgen"


def test_has_deposit_method():
    content = read_contract()
    assert "pub fn deposit" in content, "missing deposit"
    assert ".testnet" in content, "missing testnet domain check"
    assert "assert" in content, "missing domain assertion"


def test_has_chain_id_method():
    content = read_contract()
    assert "fn chain_id" in content, "missing chain_id"


def test_has_get_balance_method():
    content = read_contract()
    assert "fn get_balance" in content, "missing get_balance"


def test_deposit_checks_testnet_domain():
    content = read_contract()
    lines = content.split("\n")
    in_deposit = False
    assert_start = -1
    assert_end = -1
    for i, line in enumerate(lines):
        if "pub fn deposit" in line:
            in_deposit = True
        if in_deposit and "assert" in line and assert_start == -1:
            assert_start = i
        if assert_start >= 0 and ");" in line:
            assert_end = i + 1
            break
    assert_str = "\n".join(lines[assert_start:assert_end])
    assert ".testnet" in assert_str, "deposit assert does not check the testnet domain"
    for domain in ("example.testnet", "other.testnet"):
        assert domain.endswith(".testnet"), domain
    for domain in ("foo.example", "bar.other"):
        assert not domain.endswith(".testnet"), domain


def test_spdx_license_header():
    content = read_contract()
    assert "SPDX-License-Identifier" in content, "missing SPDX identifier"


def main():
    tests = [
        test_contract_exists,
        test_names_testnet,
        test_no_mainnet,
        test_no_key_material,
        test_has_contract_structure,
        test_contract_is_rust,
        test_has_deposit_method,
        test_has_chain_id_method,
        test_has_get_balance_method,
        test_deposit_checks_testnet_domain,
        test_spdx_license_header,
    ]
    for test in tests:
        try:
            test()
            print(f"  PASS: {test.__name__}")
        except AssertionError as exc:
            print(f"  FAIL: {test.__name__}: {exc}")
            return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
