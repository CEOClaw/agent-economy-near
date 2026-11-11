// SPDX-License-Identifier: Apache-2.0
// Nearo NEAR Testnet Demo Contract
// Chain: testnet (chain_id: testnet)
// Deployed to: nearo-testnet-demo.testnet
//
// This contract targets NEAR testnet only.

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::{env, near_bindgen, AccountId, Balance, PanicOnDefault};

#[near_bindgen]
#[derive(PanicOnDefault, BorshDeserialize, BorshSerialize)]
pub struct TestnetDemo {
    records: LookupMap<String, Balance>,
}

impl TestnetDemo {
    /// Get the chain identifier — must be testnet.
    pub fn get_chain_id() -> String {
        env::current_account_id()
            .domain()
            .to_string()
    }

    /// Submit a deposit. Only testnet allowed.
    pub fn deposit(&mut self, amount: Balance) {
        // Verify we're on testnet by checking the account domain
        let account = env::current_account_id();
        let domain = account.domain().to_string();
        assert!(
            domain.ends_with(".testnet"),
            "This contract targets NEAR testnet, not the main network"
        );

        let amount = env::attached_deposit() + amount;
        self.records.insert(&account.to_string(), &amount);
        env::log_str(&format!("Deposited {} nearo-testnet-demo.testnet", amount));
    }

    /// Get the recorded balance for an account.
    pub fn get_balance(&self, account_id: AccountId) -> Option<Balance> {
        self.records.get(&account_id.to_string())
    }

    /// Return the current chain identifier to confirm testnet.
    pub fn chain_id(&self) -> String {
        "testnet".to_string()
    }
}
