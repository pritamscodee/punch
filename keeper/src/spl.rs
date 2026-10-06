//! Hand-encoded instructions for the System, SPL Token, Associated Token and Memo programs.
//! PUNCH needs a handful of them, which is cheaper than pulling in the full program crates.

use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;

use crate::protocol::MEMO_PROGRAM;

pub const SYSTEM_PROGRAM: Pubkey = Pubkey::from_str_const("11111111111111111111111111111111");
pub const TOKEN_PROGRAM: Pubkey = Pubkey::from_str_const("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const ATA_PROGRAM: Pubkey = Pubkey::from_str_const("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
pub const MINT_SIZE: usize = 82;

pub fn memo(text: &str, signer: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(MEMO_PROGRAM, text.as_bytes(), vec![AccountMeta::new_readonly(*signer, true)])
}

pub fn transfer_lamports(from: &Pubkey, to: &Pubkey, lamports: u64) -> Instruction {
    let mut data = 2u32.to_le_bytes().to_vec();
    data.extend_from_slice(&lamports.to_le_bytes());
    Instruction::new_with_bytes(SYSTEM_PROGRAM, &data, vec![AccountMeta::new(*from, true), AccountMeta::new(*to, false)])
}

/// Zero-lamport transfer used to index a transaction under `address`.
pub fn touch(payer: &Pubkey, address: &Pubkey) -> Instruction {
    transfer_lamports(payer, address, 0)
}

pub fn create_account_with_seed(
    payer: &Pubkey,
    to: &Pubkey,
    seed: &str,
    lamports: u64,
    space: u64,
    owner: &Pubkey,
) -> Instruction {
    let mut data = 3u32.to_le_bytes().to_vec();
    data.extend_from_slice(payer.as_ref());
    data.extend_from_slice(&(seed.len() as u64).to_le_bytes());
    data.extend_from_slice(seed.as_bytes());
    data.extend_from_slice(&lamports.to_le_bytes());
    data.extend_from_slice(&space.to_le_bytes());
    data.extend_from_slice(owner.as_ref());
    Instruction::new_with_bytes(SYSTEM_PROGRAM, &data, vec![AccountMeta::new(*payer, true), AccountMeta::new(*to, false)])
}

pub fn initialize_mint2(mint: &Pubkey, decimals: u8, authority: &Pubkey) -> Instruction {
    let mut data = vec![20, decimals];
    data.extend_from_slice(authority.as_ref());
    data.push(0);
    Instruction::new_with_bytes(TOKEN_PROGRAM, &data, vec![AccountMeta::new(*mint, false)])
}

pub fn associated_token_address(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[owner.as_ref(), TOKEN_PROGRAM.as_ref(), mint.as_ref()], &ATA_PROGRAM).0
}

pub fn create_ata_idempotent(payer: &Pubkey, owner: &Pubkey, mint: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        ATA_PROGRAM,
        &[1],
        vec![
            AccountMeta::new(*payer, true),
            AccountMeta::new(associated_token_address(owner, mint), false),
            AccountMeta::new_readonly(*owner, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
            AccountMeta::new_readonly(TOKEN_PROGRAM, false),
        ],
    )
}

pub fn mint_to(mint: &Pubkey, destination: &Pubkey, authority: &Pubkey, amount: u64) -> Instruction {
    let mut data = vec![7];
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction::new_with_bytes(
        TOKEN_PROGRAM,
        &data,
        vec![AccountMeta::new(*mint, false), AccountMeta::new(*destination, false), AccountMeta::new_readonly(*authority, true)],
    )
}

/// `TransferChecked` signed by `authority`, which may be the owner or an approved delegate.
pub fn transfer_checked(
    source: &Pubkey,
    mint: &Pubkey,
    destination: &Pubkey,
    authority: &Pubkey,
    amount: u64,
    decimals: u8,
) -> Instruction {
    let mut data = vec![12];
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(decimals);
    Instruction::new_with_bytes(
        TOKEN_PROGRAM,
        &data,
        vec![
            AccountMeta::new(*source, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new(*destination, false),
            AccountMeta::new_readonly(*authority, true),
        ],
    )
}

/// The fields of an SPL token account the keeper reads.
#[derive(Debug)]
pub struct TokenAccount {
    pub amount: u64,
    pub delegate: Option<Pubkey>,
    pub delegated_amount: u64,
}

pub fn parse_token_account(data: &[u8]) -> Option<TokenAccount> {
    if data.len() < 165 {
        return None;
    }
    let u64_at = |at: usize| u64::from_le_bytes(data[at..at + 8].try_into().unwrap());
    let has_delegate = u32::from_le_bytes(data[72..76].try_into().unwrap()) == 1;
    let delegate = has_delegate.then(|| Pubkey::new_from_array(data[76..108].try_into().unwrap()));
    Some(TokenAccount { amount: u64_at(64), delegate, delegated_amount: u64_at(121) })
}

pub fn parse_mint_decimals(data: &[u8]) -> Option<u8> {
    (data.len() >= MINT_SIZE).then(|| data[44])
}
