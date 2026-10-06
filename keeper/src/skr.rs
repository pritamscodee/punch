//! Reverse `.skr` lookup (address -> names) against AllDomains' Alt Name Service on mainnet.
//! Port of Solana Mobile's reference Kit resolver. Used only for display labels, which the app
//! shows beside the truncated address, never instead of it: anyone can transfer a name to any
//! wallet, so a reverse-resolved name is not an identity claim.

use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use anyhow::Result;
use base64::Engine;
use serde_json::json;
use sha2::{Digest, Sha256};
use solana_pubkey::Pubkey;
use tokio::sync::Mutex;

use crate::rpc::Rpc;

const ANS_PROGRAM: Pubkey = Pubkey::from_str_const("ALTNSZ46uaAUU7XUV6awvdorLGqAsPwa9shm7h4uP2FK");
const TLD_HOUSE_PROGRAM: Pubkey = Pubkey::from_str_const("TLDHkysf5pCnKsVA4gXpNvmy7psXLPEu4LAdDJthT9S");
const ROOT_ANS: Pubkey = Pubkey::from_str_const("3mX9b4AZaQehNoQGfckVcmgmA6bkBoFcbLj9RMmMyNcU");
const HASH_PREFIX: &str = "ALT Name Service";
const TLD: &str = ".skr";
const HEADER_SIZE: usize = 200;
const OWNER_OFFSET: usize = 40;
const EXPIRES_AT_OFFSET: usize = 104;
const BATCH: usize = 100;
/// Names change rarely; negative results are cached too, so one address cannot drain RPC quota.
const TTL: Duration = Duration::from_secs(3600);

fn hash_name(name: &str) -> [u8; 32] {
    Sha256::digest(format!("{HASH_PREFIX}{name}").as_bytes()).into()
}

fn name_account(name: &str, parent: Option<&Pubkey>) -> Pubkey {
    let zero = [0u8; 32];
    let parent = parent.map(|p| p.to_bytes()).unwrap_or(zero);
    Pubkey::find_program_address(&[&hash_name(name), &zero, &parent], &ANS_PROGRAM).0
}

fn tld_house() -> Pubkey {
    Pubkey::find_program_address(&[b"tld_house", TLD.as_bytes()], &TLD_HOUSE_PROGRAM).0
}

fn reverse_account(name_account: &Pubkey, tld_house: &Pubkey) -> Pubkey {
    let zero = [0u8; 32];
    Pubkey::find_program_address(&[&hash_name(&name_account.to_string()), tld_house.as_ref(), &zero], &ANS_PROGRAM).0
}

fn decode(data: &serde_json::Value) -> Vec<u8> {
    data[0].as_str().and_then(|s| base64::engine::general_purpose::STANDARD.decode(s).ok()).unwrap_or_default()
}

/// Every live `.skr` name `owner` holds, sorted so the first one is stable between calls.
pub async fn resolve_names(rpc: &Rpc, owner: &str) -> Result<Vec<String>> {
    let parent = name_account(TLD, Some(&ROOT_ANS));
    let accounts = rpc
        .call(
            "getProgramAccounts",
            json!([ANS_PROGRAM.to_string(), {
                "encoding": "base64",
                "dataSlice": { "offset": EXPIRES_AT_OFFSET, "length": 8 },
                "filters": [
                    { "memcmp": { "offset": 8, "bytes": parent.to_string() } },
                    { "memcmp": { "offset": OWNER_OFFSET, "bytes": owner } }
                ]
            }]),
        )
        .await?;

    let now = chrono::Utc::now().timestamp() as u64;
    let house = tld_house();
    let reverse: Vec<String> = accounts
        .as_array()
        .into_iter()
        .flatten()
        .filter(|a| {
            let expiry = decode(&a["account"]["data"]);
            expiry.len() >= 8 && {
                let at = u64::from_le_bytes(expiry[..8].try_into().unwrap());
                at == 0 || at >= now
            }
        })
        .filter_map(|a| a["pubkey"].as_str()?.parse::<Pubkey>().ok())
        .map(|name| reverse_account(&name, &house).to_string())
        .collect();

    let mut names = Vec::new();
    for chunk in reverse.chunks(BATCH) {
        let batch = rpc.call("getMultipleAccounts", json!([chunk, { "encoding": "base64" }])).await?;
        for entry in batch["value"].as_array().into_iter().flatten() {
            let data = decode(&entry["data"]);
            if data.len() <= HEADER_SIZE {
                continue;
            }
            let label = String::from_utf8_lossy(&data[HEADER_SIZE..]);
            let label = label.split('\0').next().unwrap_or_default().trim();
            if !label.is_empty() {
                names.push(format!("{label}{TLD}"));
            }
        }
    }
    names.sort();
    Ok(names)
}

#[derive(Default)]
pub struct SkrCache {
    names: Mutex<HashMap<String, (Option<String>, Instant)>>,
}

impl SkrCache {
    /// Display label for `owner`: the first sorted `.skr` name, or none.
    pub async fn label(&self, rpc: &Rpc, owner: &str) -> Result<Option<String>> {
        if let Some((name, at)) = self.names.lock().await.get(owner) {
            if at.elapsed() < TTL {
                return Ok(name.clone());
            }
        }
        let name = resolve_names(rpc, owner).await?.into_iter().next();
        self.names.lock().await.insert(owner.to_string(), (name.clone(), Instant::now()));
        Ok(name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A wrong hash or seed order fails silently (a PDA for an account that does not exist), so
    /// pin the root derivation to the published constant.
    #[test]
    fn derives_the_ans_root() {
        assert_eq!(name_account("ANS", None), ROOT_ANS);
    }
}
