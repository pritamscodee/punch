//! Persistence. Postgres (NeonDB) when `DATABASE_URL` is set, otherwise an in-memory store so the
//! keeper still runs for local development. The chain stays the source of truth either way.

use std::{collections::HashMap, sync::Mutex};

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{PgPool, Row, postgres::PgPoolOptions};

const SCHEMA: &str = include_str!("../migrations/001_init.sql");

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settlement {
    pub pact_id: String,
    pub day: i64,
    pub signature: String,
    pub slashed: i32,
    pub paid: i64,
    pub missed: Vec<String>,
    pub punched: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Payout {
    pub pact_id: String,
    pub day: i64,
    pub from_owner: String,
    pub to_owner: String,
    pub amount: i64,
    pub signature: String,
}

#[derive(Default)]
struct Memory {
    settlements: Vec<Settlement>,
    payouts: Vec<Payout>,
    faucet: HashMap<String, DateTime<Utc>>,
    signers: HashMap<String, Vec<String>>,
}

pub struct Store {
    pg: Option<PgPool>,
    mem: Mutex<Memory>,
}

impl Store {
    pub async fn connect(database_url: Option<&str>) -> Result<Store> {
        let pg = match database_url.filter(|u| !u.trim().is_empty()) {
            Some(url) => {
                let pool = PgPoolOptions::new().max_connections(5).connect(url).await?;
                sqlx::raw_sql(SCHEMA).execute(&pool).await?;
                tracing::info!("store: postgres");
                Some(pool)
            }
            None => {
                tracing::warn!("store: DATABASE_URL not set, using in-memory storage (data is lost on restart)");
                None
            }
        };
        Ok(Store { pg, mem: Mutex::default() })
    }

    pub fn backend(&self) -> &'static str {
        if self.pg.is_some() { "postgres" } else { "memory" }
    }

    pub async fn cached_signers(&self, signature: &str) -> Result<Option<Vec<String>>> {
        if let Some(pg) = &self.pg {
            let row = sqlx::query("SELECT signers FROM verified_signers WHERE signature = $1")
                .bind(signature)
                .fetch_optional(pg)
                .await?;
            return Ok(row.map(|r| serde_json::from_value(r.get("signers")).unwrap_or_default()));
        }
        Ok(self.mem.lock().unwrap().signers.get(signature).cloned())
    }

    pub async fn cache_signers(&self, signature: &str, signers: &[String]) -> Result<()> {
        if let Some(pg) = &self.pg {
            sqlx::query("INSERT INTO verified_signers (signature, signers) VALUES ($1, $2) ON CONFLICT DO NOTHING")
                .bind(signature)
                .bind(serde_json::json!(signers))
                .execute(pg)
                .await?;
            return Ok(());
        }
        self.mem.lock().unwrap().signers.insert(signature.to_string(), signers.to_vec());
        Ok(())
    }

    pub async fn record_settlement(&self, s: &Settlement, payouts: &[Payout]) -> Result<()> {
        if let Some(pg) = &self.pg {
            let mut tx = pg.begin().await?;
            sqlx::query(
                "INSERT INTO settlements (pact_id, day, signature, slashed, paid, missed, punched)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
            )
            .bind(&s.pact_id)
            .bind(s.day)
            .bind(&s.signature)
            .bind(s.slashed)
            .bind(s.paid)
            .bind(serde_json::json!(s.missed))
            .bind(serde_json::json!(s.punched))
            .execute(&mut *tx)
            .await?;
            for p in payouts {
                sqlx::query(
                    "INSERT INTO payouts (pact_id, day, from_owner, to_owner, amount, signature)
                     VALUES ($1, $2, $3, $4, $5, $6)",
                )
                .bind(&p.pact_id)
                .bind(p.day)
                .bind(&p.from_owner)
                .bind(&p.to_owner)
                .bind(p.amount)
                .bind(&p.signature)
                .execute(&mut *tx)
                .await?;
            }
            tx.commit().await?;
            return Ok(());
        }
        let mut mem = self.mem.lock().unwrap();
        mem.settlements.push(s.clone());
        mem.payouts.extend_from_slice(payouts);
        Ok(())
    }

    pub async fn settlements(&self, pact_id: &str, limit: i64) -> Result<Vec<Settlement>> {
        if let Some(pg) = &self.pg {
            let rows = sqlx::query(
                "SELECT pact_id, day, signature, slashed, paid, missed, punched FROM settlements
                 WHERE pact_id = $1 ORDER BY day DESC LIMIT $2",
            )
            .bind(pact_id)
            .bind(limit)
            .fetch_all(pg)
            .await?;
            return Ok(rows
                .into_iter()
                .map(|r| Settlement {
                    pact_id: r.get("pact_id"),
                    day: r.get("day"),
                    signature: r.get("signature"),
                    slashed: r.get("slashed"),
                    paid: r.get("paid"),
                    missed: serde_json::from_value(r.get("missed")).unwrap_or_default(),
                    punched: serde_json::from_value(r.get("punched")).unwrap_or_default(),
                })
                .collect());
        }
        let mem = self.mem.lock().unwrap();
        let mut out: Vec<_> = mem.settlements.iter().filter(|s| s.pact_id == pact_id).cloned().collect();
        out.sort_by_key(|s| -s.day);
        out.truncate(limit as usize);
        Ok(out)
    }

    /// Payouts a wallet received or paid, newest first.
    pub async fn payouts_for(&self, owner: &str, limit: i64) -> Result<Vec<Payout>> {
        if let Some(pg) = &self.pg {
            let rows = sqlx::query(
                "SELECT pact_id, day, from_owner, to_owner, amount, signature FROM payouts
                 WHERE from_owner = $1 OR to_owner = $1 ORDER BY id DESC LIMIT $2",
            )
            .bind(owner)
            .bind(limit)
            .fetch_all(pg)
            .await?;
            return Ok(rows
                .into_iter()
                .map(|r| Payout {
                    pact_id: r.get("pact_id"),
                    day: r.get("day"),
                    from_owner: r.get("from_owner"),
                    to_owner: r.get("to_owner"),
                    amount: r.get("amount"),
                    signature: r.get("signature"),
                })
                .collect());
        }
        let mem = self.mem.lock().unwrap();
        let mut out: Vec<_> =
            mem.payouts.iter().rev().filter(|p| p.from_owner == owner || p.to_owner == owner).cloned().collect();
        out.truncate(limit as usize);
        Ok(out)
    }

    pub async fn last_faucet_claim(&self, owner: &str) -> Result<Option<DateTime<Utc>>> {
        if let Some(pg) = &self.pg {
            let row = sqlx::query("SELECT max(created_at) AS at FROM faucet_claims WHERE owner = $1")
                .bind(owner)
                .fetch_one(pg)
                .await?;
            return Ok(row.get("at"));
        }
        Ok(self.mem.lock().unwrap().faucet.get(owner).copied())
    }

    pub async fn record_faucet_claim(&self, owner: &str, signature: &str) -> Result<()> {
        if let Some(pg) = &self.pg {
            sqlx::query("INSERT INTO faucet_claims (owner, signature) VALUES ($1, $2)")
                .bind(owner)
                .bind(signature)
                .execute(pg)
                .await?;
            return Ok(());
        }
        self.mem.lock().unwrap().faucet.insert(owner.to_string(), Utc::now());
        Ok(())
    }
}
