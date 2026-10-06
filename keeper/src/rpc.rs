//! Minimal Solana JSON-RPC client. Only the calls the keeper needs.

use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use base64::Engine;
use serde::Deserialize;
use serde_json::{Value, json};
use solana_hash::Hash;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_pubkey::Pubkey;
use solana_signer::Signer;

#[derive(Clone)]
pub struct Rpc {
    http: reqwest::Client,
    url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureInfo {
    pub signature: String,
    pub block_time: Option<i64>,
    pub err: Option<Value>,
    pub memo: Option<String>,
}

impl Rpc {
    pub fn new(url: String) -> Self {
        let http = reqwest::Client::builder().timeout(Duration::from_secs(30)).build().expect("http client");
        Self { http, url }
    }

    pub async fn call(&self, method: &str, params: Value) -> Result<Value> {
        let body = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
        for attempt in 0..4 {
            let response = self.http.post(&self.url).json(&body).send().await;
            match response {
                Ok(r) if r.status().as_u16() == 429 => {}
                Ok(r) => {
                    let value: Value = r.json().await.with_context(|| format!("{method}: bad response"))?;
                    if let Some(error) = value.get("error") {
                        bail!("{method}: {error}");
                    }
                    return Ok(value["result"].clone());
                }
                Err(e) if attempt == 3 => return Err(e).with_context(|| format!("{method}: request failed")),
                Err(_) => {}
            }
            tokio::time::sleep(Duration::from_millis(500 * (attempt + 1))).await;
        }
        bail!("{method}: rate limited")
    }

    /// Full history of an address, newest first, stopping at `until` (exclusive) when given.
    pub async fn signatures_for(&self, address: &Pubkey, until: Option<&str>) -> Result<Vec<SignatureInfo>> {
        let mut all = Vec::new();
        let mut before: Option<String> = None;
        loop {
            let mut config = json!({ "commitment": "confirmed", "limit": 1000 });
            if let Some(b) = &before {
                config["before"] = json!(b);
            }
            if let Some(u) = until {
                config["until"] = json!(u);
            }
            let page: Vec<SignatureInfo> =
                serde_json::from_value(self.call("getSignaturesForAddress", json!([address.to_string(), config])).await?)?;
            let done = page.len() < 1000;
            before = page.last().map(|s| s.signature.clone());
            all.extend(page);
            if done || all.len() >= 20_000 {
                return Ok(all);
            }
        }
    }

    /// Signers of a confirmed transaction (the first `numRequiredSignatures` account keys).
    pub async fn transaction_signers(&self, signature: &str) -> Result<Vec<String>> {
        let tx = self
            .call(
                "getTransaction",
                json!([signature, { "commitment": "confirmed", "encoding": "json", "maxSupportedTransactionVersion": 0 }]),
            )
            .await?;
        let message = &tx["transaction"]["message"];
        let required = message["header"]["numRequiredSignatures"].as_u64().unwrap_or(0) as usize;
        let keys = message["accountKeys"].as_array().ok_or_else(|| anyhow!("transaction {signature} not found"))?;
        Ok(keys.iter().take(required).filter_map(|k| k.as_str().map(str::to_string)).collect())
    }

    pub async fn account_data(&self, address: &Pubkey) -> Result<Option<Vec<u8>>> {
        let result =
            self.call("getAccountInfo", json!([address.to_string(), { "commitment": "confirmed", "encoding": "base64" }])).await?;
        if result["value"].is_null() {
            return Ok(None);
        }
        let data = result["value"]["data"][0].as_str().unwrap_or_default();
        Ok(Some(base64::engine::general_purpose::STANDARD.decode(data)?))
    }

    pub async fn balance(&self, address: &Pubkey) -> Result<u64> {
        let result = self.call("getBalance", json!([address.to_string(), { "commitment": "confirmed" }])).await?;
        Ok(result["value"].as_u64().unwrap_or(0))
    }

    pub async fn rent_exempt(&self, size: usize) -> Result<u64> {
        Ok(self.call("getMinimumBalanceForRentExemption", json!([size])).await?.as_u64().unwrap_or(0))
    }

    pub async fn request_airdrop(&self, address: &Pubkey, lamports: u64) -> Result<String> {
        let sig = self.call("requestAirdrop", json!([address.to_string(), lamports])).await?;
        Ok(sig.as_str().unwrap_or_default().to_string())
    }

    async fn latest_blockhash(&self) -> Result<Hash> {
        let result = self.call("getLatestBlockhash", json!([{ "commitment": "confirmed" }])).await?;
        let hash = result["value"]["blockhash"].as_str().ok_or_else(|| anyhow!("no blockhash"))?;
        hash.parse().map_err(|_| anyhow!("bad blockhash {hash}"))
    }

    /// Build, sign, send and confirm a legacy transaction. Returns the signature.
    pub async fn send(&self, instructions: &[Instruction], payer: &Keypair, extra: &[&Keypair]) -> Result<String> {
        let blockhash = self.latest_blockhash().await?;
        let mut message = Message::new(instructions, Some(&payer.pubkey()));
        message.recent_blockhash = blockhash;
        let message_bytes = message.serialize();

        let required = message.header.num_required_signatures as usize;
        let mut wire = Vec::with_capacity(1 + 64 * required + message_bytes.len());
        wire.push(required as u8);
        for key in &message.account_keys[..required] {
            let signer = std::iter::once(payer)
                .chain(extra.iter().copied())
                .find(|k| k.pubkey() == *key)
                .ok_or_else(|| anyhow!("missing signer {key}"))?;
            wire.extend_from_slice(signer.sign_message(&message_bytes).as_ref());
        }
        wire.extend_from_slice(&message_bytes);

        let encoded = base64::engine::general_purpose::STANDARD.encode(&wire);
        let signature = self
            .call("sendTransaction", json!([encoded, { "encoding": "base64", "preflightCommitment": "confirmed" }]))
            .await?
            .as_str()
            .unwrap_or_default()
            .to_string();
        self.confirm(&signature).await?;
        Ok(signature)
    }

    pub async fn confirm(&self, signature: &str) -> Result<()> {
        for _ in 0..40 {
            let result = self.call("getSignatureStatuses", json!([[signature]])).await?;
            let status = &result["value"][0];
            if !status.is_null() {
                if !status["err"].is_null() {
                    bail!("transaction {signature} failed: {}", status["err"]);
                }
                let level = status["confirmationStatus"].as_str().unwrap_or_default();
                if level == "confirmed" || level == "finalized" {
                    return Ok(());
                }
            }
            tokio::time::sleep(Duration::from_millis(750)).await;
        }
        bail!("transaction {signature} was not confirmed in time")
    }
}
