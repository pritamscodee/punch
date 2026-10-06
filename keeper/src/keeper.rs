//! The keeper: discovers pacts from the on-chain registry, settles closed shifts by pulling each
//! absent member's penalty through their SPL delegate approval and splitting it between the members
//! who punched in, and runs the devnet faucet.

use std::{
    collections::{BTreeSet, HashMap},
    sync::Arc,
};

use anyhow::{Context, Result, anyhow, bail};
use chrono::Utc;
use serde::Serialize;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_signer::Signer;
use tokio::sync::Mutex;

use crate::{
    protocol::{self, Entry, Ledger, PactDef, Record},
    rpc::Rpc,
    seeker::SeekerCache,
    skr::SkrCache,
    spl,
    store::{Payout, Settlement, Store},
};

pub const MINT_SEED: &str = "punch-tskr-v1";
pub const MINT_DECIMALS: u8 = 6;
pub const FAUCET_TOKENS: u64 = 100 * 10u64.pow(MINT_DECIMALS as u32);
pub const FAUCET_LAMPORTS: u64 = 50_000_000; // 0.05 SOL, enough for hundreds of punches
const FAUCET_COOLDOWN_SECS: i64 = 600;
/// Shifts older than this are left unsettled if the keeper was offline; nobody is charged for them.
const MAX_BACKLOG_DAYS: i64 = 6;
const TRANSFERS_PER_TX: usize = 6;

#[derive(Default)]
struct PactCache {
    entries: Vec<Entry>,
    newest: Option<String>,
}

pub struct Keeper {
    pub rpc: Rpc,
    /// Seeker Genesis Tokens live on mainnet whatever cluster pacts run on.
    sgt_rpc: Rpc,
    pub signer: Keypair,
    pub store: Store,
    pub mint: Pubkey,
    pacts: Mutex<HashMap<String, PactCache>>,
    registry: Mutex<PactCache>,
    settle_lock: Mutex<()>,
    seekers: SeekerCache,
    skr: SkrCache,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PactSummary {
    #[serde(flatten)]
    pub def: PactDef,
    pub clock: String,
    pub members: usize,
    pub current_day: i64,
    pub closes_at: i64,
    pub punched_today: usize,
    pub punched_today_owners: Vec<String>,
    pub at_risk_today: usize,
    /// Members holding a verified Seeker Genesis Token.
    pub seekers: Vec<String>,
    /// owner -> first sorted `.skr` name, for display beside the address.
    pub names: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaucetResult {
    pub signature: String,
    pub tokens: u64,
    pub lamports: u64,
}

pub fn mint_address(keeper: &Pubkey) -> Pubkey {
    Pubkey::create_with_seed(keeper, MINT_SEED, &spl::TOKEN_PROGRAM).expect("valid seed")
}

impl Keeper {
    pub fn new(rpc: Rpc, sgt_rpc: Rpc, signer: Keypair, store: Store) -> Arc<Keeper> {
        let mint = mint_address(&signer.pubkey());
        Arc::new(Keeper {
            rpc,
            sgt_rpc,
            signer,
            store,
            mint,
            pacts: Mutex::default(),
            registry: Mutex::default(),
            settle_lock: Mutex::default(),
            seekers: SeekerCache::default(),
            skr: SkrCache::default(),
        })
    }

    pub fn address(&self) -> Pubkey {
        self.signer.pubkey()
    }

    /// Fetch new signatures for `address` and append them to `cache`.
    async fn refresh(&self, address: &Pubkey, cache: &mut PactCache) -> Result<()> {
        let fresh = self.rpc.signatures_for(address, cache.newest.as_deref()).await?;
        if let Some(first) = fresh.first() {
            cache.newest = Some(first.signature.clone());
        }
        for info in fresh {
            if info.err.is_some() {
                continue;
            }
            let records = info.memo.as_deref().map(protocol::parse_memo_field).unwrap_or_default();
            if records.is_empty() {
                continue;
            }
            cache.entries.push(Entry { signature: info.signature, block_time: info.block_time.unwrap_or(0), records });
        }
        Ok(())
    }

    /// Pact definitions registered on chain, oldest first, de-duplicated by id.
    pub async fn discover(&self) -> Result<Vec<PactDef>> {
        let mut registry = self.registry.lock().await;
        self.refresh(&protocol::registry_address(), &mut registry).await?;
        let mut entries = registry.entries.clone();
        entries.sort_by_key(|e| e.block_time);
        let mut seen = BTreeSet::new();
        let mut defs = Vec::new();
        for entry in entries {
            for record in entry.records {
                if let Record::Pact(def) = record {
                    if seen.insert(def.id.clone()) {
                        defs.push(def);
                    }
                }
            }
        }
        Ok(defs)
    }

    async fn signers_of(&self, signature: &str) -> Result<Vec<String>> {
        if let Some(cached) = self.store.cached_signers(signature).await? {
            return Ok(cached);
        }
        let signers = self.rpc.transaction_signers(signature).await?;
        self.store.cache_signers(signature, &signers).await?;
        Ok(signers)
    }

    /// Build the verified ledger for a pact: every JOIN and IN must be signed by the owner it claims.
    pub async fn ledger(&self, pact_id: &str) -> Result<Ledger> {
        let entries = {
            let mut pacts = self.pacts.lock().await;
            let cache = pacts.entry(pact_id.to_string()).or_default();
            self.refresh(&protocol::clock_address(pact_id), cache).await?;
            cache.entries.clone()
        };
        let mut signers: HashMap<String, Vec<String>> = HashMap::new();
        for entry in &entries {
            if entry.records.iter().any(|r| protocol::claimed_owner(r).is_some()) && !signers.contains_key(&entry.signature) {
                signers.insert(entry.signature.clone(), self.signers_of(&entry.signature).await?);
            }
        }
        Ok(Ledger::build(pact_id, entries, |sig, owner| {
            signers.get(sig).is_some_and(|s| s.iter().any(|k| k == owner))
        }))
    }

    pub async fn summary(&self, pact_id: &str) -> Result<PactSummary> {
        let ledger = self.ledger(pact_id).await?;
        let def = ledger.def.clone().ok_or_else(|| anyhow!("pact {pact_id} not found"))?;
        let today = def.day_at(Utc::now().timestamp());
        let punched: Vec<String> = ledger.punches.get(&today).map(|s| s.iter().cloned().collect()).unwrap_or_default();
        let eligible = ledger.eligible(today);
        let mut seekers = Vec::new();
        let mut names = std::collections::BTreeMap::new();
        for owner in ledger.members.keys().take(100) {
            match self.seekers.sgt_of(&self.sgt_rpc, owner).await {
                Ok(Some(_)) => seekers.push(owner.clone()),
                Ok(None) => {}
                Err(error) => tracing::debug!(owner, "SGT check failed: {error:#}"),
            }
            match self.skr.label(&self.sgt_rpc, owner).await {
                Ok(Some(name)) => {
                    names.insert(owner.clone(), name);
                }
                Ok(None) => {}
                Err(error) => tracing::debug!(owner, ".skr lookup failed: {error:#}"),
            }
        }
        Ok(PactSummary {
            names,
            seekers,
            clock: protocol::clock_address(pact_id).to_string(),
            members: ledger.members.len(),
            current_day: today,
            closes_at: def.day_start(today + 1),
            punched_today: punched.len(),
            at_risk_today: eligible.iter().filter(|o| !punched.contains(o)).count(),
            punched_today_owners: punched,
            def,
        })
    }

    /// Settle every closed, unsettled shift of every pact this keeper is the settler for.
    pub async fn settle_all(&self) -> Result<()> {
        for def in self.discover().await? {
            if def.settler != self.address().to_string() {
                continue;
            }
            if let Err(error) = self.settle_pact(&def.id).await {
                tracing::warn!(pact = def.id, "settlement failed: {error:#}");
            }
        }
        Ok(())
    }

    pub async fn settle_pact(&self, pact_id: &str) -> Result<Vec<Settlement>> {
        let _guard = self.settle_lock.lock().await;
        let ledger = self.ledger(pact_id).await?;
        let def = ledger.def.clone().ok_or_else(|| anyhow!("pact {pact_id} not found"))?;
        if def.settler != self.address().to_string() {
            bail!("pact {pact_id} is settled by {}, not this keeper", def.settler);
        }
        let Some(first_joined) = ledger.members.values().min().copied() else { return Ok(vec![]) };
        let current = def.day_at(Utc::now().timestamp());
        let first_day = (def.day_at(first_joined) + 1).max(current - MAX_BACKLOG_DAYS);

        let mut done = Vec::new();
        for day in first_day..current {
            if ledger.settled.contains(&day) || ledger.eligible(day).is_empty() {
                continue;
            }
            let settlement = self.settle_day(&def, &ledger, day).await.with_context(|| format!("{pact_id} day {day}"))?;
            tracing::info!(pact = pact_id, day, slashed = settlement.slashed, paid = settlement.paid, "settled");
            done.push(settlement);
        }
        Ok(done)
    }

    async fn settle_day(&self, def: &PactDef, ledger: &Ledger, day: i64) -> Result<Settlement> {
        let keeper = self.address();
        let mint: Pubkey = def.mint.parse().map_err(|_| anyhow!("bad mint"))?;
        let eligible = ledger.eligible(day);
        let punched: Vec<String> = ledger.punches.get(&day).map(|s| s.iter().cloned().collect()).unwrap_or_default();
        let missed: Vec<String> = eligible.iter().filter(|o| !punched.contains(o)).cloned().collect();

        // Bonded = the settler may take at least one penalty from this member right now. Only bonded
        // members are paid, so nobody can join with an empty wallet and collect without risk.
        let bonded = async |key: &Pubkey| -> Result<bool> {
            let Some(data) = self.rpc.account_data(&spl::associated_token_address(key, &mint)).await? else {
                return Ok(false);
            };
            Ok(spl::parse_token_account(&data).is_some_and(|a| {
                a.delegate == Some(keeper) && a.delegated_amount >= def.penalty && a.amount >= def.penalty
            }))
        };

        let mut receivers = Vec::new();
        for owner in &punched {
            let key: Pubkey = owner.parse().map_err(|_| anyhow!("bad owner"))?;
            if bonded(&key).await? {
                receivers.push(key);
            }
        }

        let mut transfers: Vec<(Pubkey, Pubkey, u64)> = Vec::new();
        let mut slashed = 0;
        if !receivers.is_empty() && def.penalty > 0 {
            for owner in &missed {
                let key: Pubkey = owner.parse().map_err(|_| anyhow!("bad owner"))?;
                if !bonded(&key).await? {
                    tracing::info!(pact = def.id, day, owner, "absent member is unbonded; nothing to take");
                    continue;
                }
                slashed += 1;
                let share = def.penalty / receivers.len() as u64;
                let remainder = def.penalty - share * receivers.len() as u64;
                for (i, receiver) in receivers.iter().enumerate() {
                    let amount = share + if i == 0 { remainder } else { 0 };
                    if amount > 0 {
                        transfers.push((key, *receiver, amount));
                    }
                }
            }
        }
        let paid: u64 = transfers.iter().map(|t| t.2).sum();

        // The first transaction carries the SETTLE record, so a shift is never charged twice.
        let memo = format!("{}|SETTLE|{}|{}|{}|{}|{}|{}", protocol::PREFIX, def.id, day, slashed, paid, missed.len(), punched.len());
        let mut chunks: Vec<Vec<Instruction>> = transfers
            .chunks(TRANSFERS_PER_TX)
            .map(|chunk| {
                chunk
                    .iter()
                    .map(|(from, to, amount)| {
                        spl::transfer_checked(
                            &spl::associated_token_address(from, &mint),
                            &mint,
                            &spl::associated_token_address(to, &mint),
                            &keeper,
                            *amount,
                            def.decimals,
                        )
                    })
                    .collect()
            })
            .collect();
        if chunks.is_empty() {
            chunks.push(Vec::new());
        }
        chunks[0].insert(0, spl::memo(&memo, &keeper));
        chunks[0].insert(1, spl::touch(&keeper, &protocol::clock_address(&def.id)));

        let mut signatures = Vec::new();
        for chunk in &chunks {
            signatures.push(self.rpc.send(chunk, &self.signer, &[]).await?);
        }

        let mut payouts = Vec::new();
        let mut index = 0;
        for (chunk_index, chunk) in transfers.chunks(TRANSFERS_PER_TX).enumerate() {
            for (from, to, amount) in chunk {
                payouts.push(Payout {
                    pact_id: def.id.clone(),
                    day,
                    from_owner: from.to_string(),
                    to_owner: to.to_string(),
                    amount: *amount as i64,
                    signature: signatures[chunk_index].clone(),
                });
                index += 1;
            }
        }
        debug_assert_eq!(index, transfers.len());

        let settlement = Settlement {
            pact_id: def.id.clone(),
            day,
            signature: signatures[0].clone(),
            slashed,
            paid: paid as i64,
            missed,
            punched,
        };
        self.store.record_settlement(&settlement, &payouts).await?;
        Ok(settlement)
    }

    /// Devnet faucet: test tokens plus a little SOL for fees when the wallet is nearly empty.
    pub async fn faucet(&self, owner: &str) -> Result<FaucetResult> {
        let key: Pubkey = owner.parse().map_err(|_| anyhow!("not a valid address"))?;
        if let Some(last) = self.store.last_faucet_claim(owner).await? {
            let wait = FAUCET_COOLDOWN_SECS - (Utc::now() - last).num_seconds();
            if wait > 0 {
                bail!("faucet cooldown: try again in {} min", wait / 60 + 1);
            }
        }
        let keeper = self.address();
        let mut instructions = vec![
            spl::create_ata_idempotent(&keeper, &key, &self.mint),
            spl::mint_to(&self.mint, &spl::associated_token_address(&key, &self.mint), &keeper, FAUCET_TOKENS),
        ];
        let mut lamports = 0;
        if self.rpc.balance(&key).await? < FAUCET_LAMPORTS / 5 && self.rpc.balance(&keeper).await? > 10 * FAUCET_LAMPORTS {
            lamports = FAUCET_LAMPORTS;
            instructions.push(spl::transfer_lamports(&keeper, &key, lamports));
        }
        let signature = self.rpc.send(&instructions, &self.signer, &[]).await?;
        self.store.record_faucet_claim(owner, &signature).await?;
        Ok(FaucetResult { signature, tokens: FAUCET_TOKENS, lamports })
    }

    /// One-time devnet setup: fund the keeper, create the test mint, register the public pacts.
    pub async fn setup(&self) -> Result<()> {
        let keeper = self.address();
        let balance = self.rpc.balance(&keeper).await?;
        tracing::info!(%keeper, balance, "keeper");
        if balance < 500_000_000 {
            match self.rpc.request_airdrop(&keeper, 2_000_000_000).await {
                Ok(sig) => {
                    self.rpc.confirm(&sig).await?;
                    tracing::info!("airdropped 2 SOL");
                }
                Err(e) => bail!("airdrop failed ({e}); fund {keeper} at https://faucet.solana.com and rerun"),
            }
        }

        if self.rpc.account_data(&self.mint).await?.is_none() {
            let rent = self.rpc.rent_exempt(spl::MINT_SIZE).await?;
            let sig = self
                .rpc
                .send(
                    &[
                        spl::create_account_with_seed(&keeper, &self.mint, MINT_SEED, rent, spl::MINT_SIZE as u64, &spl::TOKEN_PROGRAM),
                        spl::initialize_mint2(&self.mint, MINT_DECIMALS, &keeper),
                    ],
                    &self.signer,
                    &[],
                )
                .await?;
            tracing::info!(mint = %self.mint, sig, "created test mint");
        }

        let unit = 10u64.pow(MINT_DECIMALS as u32);
        let now = Utc::now().timestamp();
        let defaults = [
            PactDef {
                id: "DAWN".into(),
                name: "Dawn Shift".into(),
                mint: self.mint.to_string(),
                decimals: MINT_DECIMALS,
                bond: 50 * unit,
                penalty: 10 * unit,
                period: 86_400,
                origin: 0,
                settler: keeper.to_string(),
            },
            PactDef {
                id: "DEMO".into(),
                name: "Demo Floor".into(),
                mint: self.mint.to_string(),
                decimals: MINT_DECIMALS,
                bond: 50 * unit,
                penalty: 5 * unit,
                period: 300,
                origin: now - now.rem_euclid(300),
                settler: keeper.to_string(),
            },
        ];
        let existing: BTreeSet<String> = self.discover().await?.into_iter().map(|d| d.id).collect();
        for def in defaults {
            if existing.contains(&def.id) {
                continue;
            }
            let sig = self.register_pact(&def).await?;
            tracing::info!(pact = def.id, sig, "registered pact");
        }
        Ok(())
    }

    async fn register_pact(&self, def: &PactDef) -> Result<String> {
        let keeper = self.address();
        self.rpc
            .send(
                &[
                    spl::memo(&def.memo(), &keeper),
                    spl::touch(&keeper, &protocol::clock_address(&def.id)),
                    spl::touch(&keeper, &protocol::registry_address()),
                ],
                &self.signer,
                &[],
            )
            .await
    }
}
