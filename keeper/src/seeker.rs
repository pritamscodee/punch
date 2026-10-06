//! Seeker Genesis Token (SGT) verification, per Solana Mobile's published procedure: a Token-2022
//! mint counts as an SGT only if its mint authority, metadata pointer (authority and address) and
//! token group membership all match. Checking fewer fields lets any one of them be forged.
//!
//! The owner being checked is always one that signed a JOIN on chain, so the address is proven.

use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use anyhow::Result;
use serde_json::{Value, json};
use tokio::sync::Mutex;

use crate::rpc::Rpc;

const TOKEN_2022_PROGRAM: &str = "TokenzQdBNbLqP5VEhdkAS6EnHrTq3wDqwcY5Prb7Xb";
const SGT_MINT_AUTHORITY: &str = "GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4";
const SGT_METADATA_ADDRESS: &str = "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te";
const SGT_GROUP_MINT_ADDRESS: &str = "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te";
const TTL: Duration = Duration::from_secs(3600);

#[derive(Default)]
pub struct SeekerCache {
    /// owner -> (SGT mint if one is held, when checked)
    checked: Mutex<HashMap<String, (Option<String>, Instant)>>,
}

fn extension<'a>(mint: &'a Value, name: &str) -> Option<&'a Value> {
    mint["extensions"].as_array()?.iter().find(|e| e["extension"] == name).map(|e| &e["state"])
}

pub fn is_sgt_mint(parsed_mint: &Value) -> bool {
    let pointer = extension(parsed_mint, "metadataPointer");
    let member = extension(parsed_mint, "tokenGroupMember");
    parsed_mint["mintAuthority"] == SGT_MINT_AUTHORITY
        && pointer.is_some_and(|p| p["authority"] == SGT_MINT_AUTHORITY && p["metadataAddress"] == SGT_METADATA_ADDRESS)
        && member.is_some_and(|m| m["group"] == SGT_GROUP_MINT_ADDRESS)
}

impl SeekerCache {
    /// The SGT mint `owner` holds, if any. Returning the mint (not a bool) lets callers dedupe by device.
    pub async fn sgt_of(&self, rpc: &Rpc, owner: &str) -> Result<Option<String>> {
        if let Some((mint, at)) = self.checked.lock().await.get(owner) {
            if at.elapsed() < TTL {
                return Ok(mint.clone());
            }
        }
        let accounts = rpc
            .call(
                "getTokenAccountsByOwner",
                json!([owner, { "programId": TOKEN_2022_PROGRAM }, { "encoding": "jsonParsed", "commitment": "confirmed" }]),
            )
            .await?;
        let mut found = None;
        for account in accounts["value"].as_array().into_iter().flatten() {
            let info = &account["account"]["data"]["parsed"]["info"];
            if info["tokenAmount"]["amount"] != "1" {
                continue;
            }
            let Some(mint) = info["mint"].as_str() else { continue };
            let mint_info = rpc.call("getAccountInfo", json!([mint, { "encoding": "jsonParsed" }])).await?;
            if is_sgt_mint(&mint_info["value"]["data"]["parsed"]["info"]) {
                found = Some(mint.to_string());
                break;
            }
        }
        self.checked.lock().await.insert(owner.to_string(), (found.clone(), Instant::now()));
        Ok(found)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requires_every_field() {
        let genuine = json!({
            "mintAuthority": SGT_MINT_AUTHORITY,
            "extensions": [
                { "extension": "metadataPointer", "state": { "authority": SGT_MINT_AUTHORITY, "metadataAddress": SGT_METADATA_ADDRESS } },
                { "extension": "tokenGroupMember", "state": { "group": SGT_GROUP_MINT_ADDRESS, "memberNumber": 1 } }
            ]
        });
        assert!(is_sgt_mint(&genuine));
        let mut forged = genuine.clone();
        forged["extensions"][1]["state"]["group"] = json!("SomeOtherGroup");
        assert!(!is_sgt_mint(&forged));
        let mut forged = genuine;
        forged["mintAuthority"] = json!("Attacker");
        assert!(!is_sgt_mint(&forged));
    }
}
