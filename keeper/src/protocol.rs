//! The PUNCH v1 wire protocol.
//!
//! Every PUNCH record is an SPL Memo whose text starts with `PUNCH1|`. Each record transaction also
//! touches the pact's *clock address* (a PDA nobody can sign for) with a zero-lamport transfer, so
//! `getSignaturesForAddress(clock)` returns the full history of a pact, memo text included, without a
//! custom program or an indexer. The mobile app (`src/features/punch/protocol`) mirrors these rules.
//!
//! ```text
//! PUNCH1|PACT|<id>|<name>|<mint>|<decimals>|<bond>|<penalty>|<period>|<origin>|<settler>
//! PUNCH1|JOIN|<id>|<owner>
//! PUNCH1|IN|<id>|<day>|<owner>
//! PUNCH1|SETTLE|<id>|<day>|<slashed>|<paid>|<missed>|<punched>
//! ```

use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;
use solana_pubkey::Pubkey;

pub const MEMO_PROGRAM: Pubkey = Pubkey::from_str_const("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
pub const PREFIX: &str = "PUNCH1";

/// Clock address for a pact: every record of the pact touches it.
pub fn clock_address(pact_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"punch-clock", pact_id.as_bytes()], &MEMO_PROGRAM).0
}

/// Registry address: every PACT definition also touches it, so pacts are discoverable on chain.
pub fn registry_address() -> Pubkey {
    Pubkey::find_program_address(&[b"punch-registry"], &MEMO_PROGRAM).0
}

pub fn is_valid_pact_id(id: &str) -> bool {
    (3..=12).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'-')
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PactDef {
    pub id: String,
    pub name: String,
    pub mint: String,
    pub decimals: u8,
    pub bond: u64,
    pub penalty: u64,
    pub period: i64,
    pub origin: i64,
    pub settler: String,
}

impl PactDef {
    pub fn day_at(&self, unix: i64) -> i64 {
        (unix - self.origin).div_euclid(self.period)
    }

    pub fn day_start(&self, day: i64) -> i64 {
        self.origin + day * self.period
    }

    pub fn memo(&self) -> String {
        format!(
            "{PREFIX}|PACT|{}|{}|{}|{}|{}|{}|{}|{}|{}",
            self.id, self.name, self.mint, self.decimals, self.bond, self.penalty, self.period, self.origin, self.settler
        )
    }
}

#[derive(Clone, Debug)]
pub enum Record {
    Pact(PactDef),
    Join { pact: String, owner: String },
    In { pact: String, day: i64, owner: String },
    Settle { pact: String, day: i64 },
}

/// Parse the `memo` field of a `getSignaturesForAddress` entry. The RPC formats it as
/// `[len] text` per memo instruction, joined by `; `.
pub fn parse_memo_field(field: &str) -> Vec<Record> {
    field
        .split("; ")
        .filter_map(|part| {
            let text = part.trim();
            let text = match text.find("] ") {
                Some(i) if text.starts_with('[') => &text[i + 2..],
                _ => text,
            };
            parse_record(text)
        })
        .collect()
}

pub fn parse_record(text: &str) -> Option<Record> {
    let parts: Vec<&str> = text.trim().split('|').collect();
    if parts.first() != Some(&PREFIX) || parts.len() < 3 || !is_valid_pact_id(parts[2]) {
        return None;
    }
    let pact = parts[2].to_string();
    match (parts[1], parts.len()) {
        ("PACT", 11) => Some(Record::Pact(PactDef {
            id: pact,
            name: parts[3].to_string(),
            mint: parts[4].to_string(),
            decimals: parts[5].parse().ok()?,
            bond: parts[6].parse().ok()?,
            penalty: parts[7].parse().ok()?,
            period: parts[8].parse().ok().filter(|p: &i64| *p >= 60)?,
            origin: parts[9].parse().ok()?,
            settler: parts[10].to_string(),
        })),
        ("JOIN", 4) => Some(Record::Join { pact, owner: parts[3].to_string() }),
        ("IN", 5) => Some(Record::In { pact, day: parts[3].parse().ok()?, owner: parts[4].to_string() }),
        ("SETTLE", 8) => Some(Record::Settle { pact, day: parts[3].parse().ok()? }),
        _ => None,
    }
}

/// One confirmed, successful transaction on a clock address.
#[derive(Clone, Debug)]
pub struct Entry {
    pub signature: String,
    pub block_time: i64,
    pub records: Vec<Record>,
}

/// Derived state of a pact. Only records that pass [`Ledger::build`]'s rules count.
#[derive(Debug, Default)]
pub struct Ledger {
    pub def: Option<PactDef>,
    /// owner -> unix time of their first JOIN
    pub members: BTreeMap<String, i64>,
    /// day -> owners who punched in that day
    pub punches: BTreeMap<i64, BTreeSet<String>>,
    pub settled: BTreeSet<i64>,
}

impl Ledger {
    /// `entries` may be in any order. `verified(signature, owner)` must return whether `owner` signed.
    pub fn build(pact_id: &str, mut entries: Vec<Entry>, verified: impl Fn(&str, &str) -> bool) -> Ledger {
        entries.sort_by_key(|e| e.block_time);
        let mut ledger = Ledger::default();
        for entry in &entries {
            for record in &entry.records {
                match record {
                    Record::Pact(def) if def.id == pact_id && ledger.def.is_none() => ledger.def = Some(def.clone()),
                    Record::Join { pact, owner } if pact == pact_id => {
                        if verified(&entry.signature, owner) {
                            ledger.members.entry(owner.clone()).or_insert(entry.block_time);
                        }
                    }
                    Record::In { pact, day, owner } if pact == pact_id => {
                        let Some(def) = &ledger.def else { continue };
                        // The claimed day must be the day the cluster recorded: no backdating.
                        if def.day_at(entry.block_time) == *day
                            && ledger.members.contains_key(owner)
                            && verified(&entry.signature, owner)
                        {
                            ledger.punches.entry(*day).or_default().insert(owner.clone());
                        }
                    }
                    Record::Settle { pact, day } if pact == pact_id => {
                        ledger.settled.insert(*day);
                    }
                    _ => {}
                }
            }
        }
        ledger
    }

    /// Owners who were members for the whole of `day`.
    pub fn eligible(&self, day: i64) -> BTreeSet<String> {
        let Some(def) = &self.def else { return BTreeSet::new() };
        let start = def.day_start(day);
        self.members.iter().filter(|(_, joined)| **joined < start).map(|(o, _)| o.clone()).collect()
    }
}

/// Owner claimed by a record, for signer verification.
pub fn claimed_owner(record: &Record) -> Option<&str> {
    match record {
        Record::Join { owner, .. } | Record::In { owner, .. } => Some(owner),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn def() -> PactDef {
        PactDef {
            id: "DEMO".into(),
            name: "Demo".into(),
            mint: "m".into(),
            decimals: 6,
            bond: 50,
            penalty: 5,
            period: 300,
            origin: 0,
            settler: "s".into(),
        }
    }

    /// Must match what the app derives (`npx tsx scripts/clock-address.ts`).
    #[test]
    fn addresses_match_the_app() {
        assert_eq!(clock_address("DAWN").to_string(), "6f3Y5R8TCiYmQYqe8eTDNYhRFrQmhyP3KTJDb5GSxBmm");
        assert_eq!(clock_address("DEMO").to_string(), "8tm8UFoqWCqUQHuGYnS6zb7PxPXLkNEavU4HSX6YhdoW");
        assert_eq!(registry_address().to_string(), "DxTvhhWJekxQ3wRJKhK4F5HJAwJVXMD3gcJYYYvUXULp");
    }

    #[test]
    fn parses_rpc_memo_field() {
        let field = format!("[18] hello; [40] {}", "PUNCH1|IN|DEMO|7|Alice");
        let records = parse_memo_field(&field);
        assert!(matches!(&records[..], [Record::In { day: 7, .. }]));
        let pact = parse_memo_field(&format!("[99] {}", def().memo()));
        assert!(matches!(&pact[..], [Record::Pact(d)] if d.period == 300));
    }

    #[test]
    fn rejects_backdated_and_unjoined_punches() {
        let e = |sig: &str, t: i64, r: Record| Entry { signature: sig.into(), block_time: t, records: vec![r] };
        let entries = vec![
            e("a", 0, Record::Pact(def())),
            e("b", 10, Record::Join { pact: "DEMO".into(), owner: "Alice".into() }),
            e("c", 400, Record::In { pact: "DEMO".into(), day: 1, owner: "Alice".into() }),
            e("d", 700, Record::In { pact: "DEMO".into(), day: 1, owner: "Alice".into() }),
            e("e", 700, Record::In { pact: "DEMO".into(), day: 2, owner: "Bob".into() }),
        ];
        let ledger = Ledger::build("DEMO", entries, |_, _| true);
        assert_eq!(ledger.punches.get(&1).map(|s| s.len()), Some(1));
        assert!(ledger.punches.get(&2).is_none());
        assert_eq!(ledger.eligible(0).len(), 0);
        assert_eq!(ledger.eligible(1).len(), 1);
    }
}
