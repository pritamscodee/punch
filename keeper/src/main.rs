//! PUNCH keeper service.
//!
//! ```text
//! keeper keygen   print a new keeper secret (base58) for KEEPER_SECRET
//! keeper setup    fund the keeper on devnet, create the tSKR test mint, register the public pacts
//! keeper serve    run the HTTP API and the settlement loop (default)
//! ```

mod api;
mod keeper;
mod protocol;
mod rpc;
mod seeker;
mod skr;
mod spl;
mod store;

use std::time::Duration;

use anyhow::{Context, Result, bail};
use solana_keypair::Keypair;
use solana_signer::Signer;
use tracing_subscriber::EnvFilter;

use crate::{keeper::Keeper, rpc::Rpc, store::Store};

fn env(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty())
}

fn load_signer() -> Result<Keypair> {
    if let Some(secret) = env("KEEPER_SECRET") {
        return Keypair::try_from_base58_string(secret.trim()).context("KEEPER_SECRET is not a base58 keypair");
    }
    if let Some(path) = env("KEEPER_KEYPAIR_PATH") {
        let bytes: Vec<u8> = serde_json::from_str(&std::fs::read_to_string(&path)?).context("keypair file must be a JSON byte array")?;
        return Keypair::try_from(bytes.as_slice()).context("invalid keypair bytes");
    }
    bail!("set KEEPER_SECRET (run `keeper keygen`) or KEEPER_KEYPAIR_PATH")
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,sqlx=warn")))
        .init();

    let command = std::env::args().nth(1).unwrap_or_else(|| "serve".into());
    if command == "keygen" {
        let keypair = Keypair::new();
        println!("KEEPER_SECRET={}", keypair.to_base58_string());
        println!("# address: {}", keypair.pubkey());
        return Ok(());
    }

    let rpc = Rpc::new(env("RPC_URL").unwrap_or_else(|| "https://api.devnet.solana.com".into()));
    let store = Store::connect(env("DATABASE_URL").as_deref()).await.context("connecting to DATABASE_URL")?;
    let sgt_rpc = Rpc::new(env("SGT_RPC_URL").unwrap_or_else(|| "https://api.mainnet-beta.solana.com".into()));
    let keeper = Keeper::new(rpc, sgt_rpc, load_signer()?, store);
    tracing::info!(keeper = %keeper.address(), mint = %keeper.mint, "PUNCH keeper");

    match command.as_str() {
        "setup" => keeper.setup().await,
        "serve" => {
            let interval: u64 = env("SETTLE_INTERVAL_SECS").and_then(|v| v.parse().ok()).unwrap_or(30);
            let loop_keeper = keeper.clone();
            tokio::spawn(async move {
                loop {
                    if let Err(error) = loop_keeper.settle_all().await {
                        tracing::warn!("settlement pass failed: {error:#}");
                    }
                    tokio::time::sleep(Duration::from_secs(interval)).await;
                }
            });

            let port = env("PORT").unwrap_or_else(|| "8787".into());
            let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
            tracing::info!("listening on :{port}");
            axum::serve(listener, api::router(keeper)).await?;
            Ok(())
        }
        other => bail!("unknown command `{other}` (expected keygen, setup or serve)"),
    }
}
