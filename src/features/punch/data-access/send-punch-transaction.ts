import {
  type Address,
  appendTransactionMessageInstructions,
  assertIsTransactionMessageWithSingleSendingSigner,
  compileTransactionMessage,
  createTransactionMessage,
  getBase58Decoder,
  getBase64Decoder,
  getCompiledTransactionMessageEncoder,
  type Instruction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Signature,
  signAndSendTransactionMessageWithSigners,
  type TransactionMessageBytesBase64,
  type TransactionSendingSigner,
} from '@solana/kit'
import { getAddMemoInstruction } from '@solana-program/memo'
import { getTransferSolInstruction } from '@solana-program/system'
import {
  findAssociatedTokenPda,
  getApproveCheckedInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'

import type { SolanaClient } from '@/features/cluster/data-access/create-solana-client'
import { getClockAddress, getRegistryAddress } from '@/features/punch/protocol/addresses'
import { encodeIn, encodeJoin, encodePact, type PactDef } from '@/features/punch/protocol/records'
import { assertCanPayTransactionFee } from '@/features/wallet/util/assert-can-pay-transaction-fee'

export type GetTransactionSigner = (address: Address, minContextSlot: bigint) => TransactionSendingSigner

type SendArgs = {
  client: SolanaClient
  getTransactionSigner: GetTransactionSigner
  owner: Address
}

/**
 * Build a transaction from `build`, check the wallet can pay the fee, hand it to the wallet over
 * Mobile Wallet Adapter, and wait for the cluster to confirm it.
 */
async function sendWithWallet(
  { client, getTransactionSigner, owner }: SendArgs,
  build: (signer: TransactionSendingSigner) => Promise<Instruction[]> | Instruction[],
): Promise<{ memoBlockTime: number; signature: Signature }> {
  const {
    context: { slot: minContextSlot },
    value: latestBlockhash,
  } = await client.rpc.getLatestBlockhash({ commitment: 'confirmed' }).send()
  const signer = getTransactionSigner(owner, minContextSlot)
  const instructions = await build(signer)
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  )
  assertIsTransactionMessageWithSingleSendingSigner(message)

  const encoded = getCompiledTransactionMessageEncoder().encode(compileTransactionMessage(message))
  const [{ value: balance }, { value: fee }] = await Promise.all([
    client.rpc.getBalance(owner, { commitment: 'confirmed' }).send(),
    client.rpc
      .getFeeForMessage(getBase64Decoder().decode(encoded) as TransactionMessageBytesBase64, {
        commitment: 'confirmed',
      })
      .send(),
  ])
  assertCanPayTransactionFee({ balance, fee })

  const signature = getBase58Decoder().decode(await signAndSendTransactionMessageWithSigners(message)) as Signature
  await waitForConfirmation(client, signature)
  return { memoBlockTime: Math.floor(Date.now() / 1000), signature }
}

async function waitForConfirmation(client: SolanaClient, signature: Signature) {
  for (let attempt = 0; attempt < 45; attempt++) {
    // The transaction is already submitted, so a dropped status request (a DNS blip, a flaky
    // mobile connection) is retried rather than reported as a failed punch.
    const status = await client.rpc
      .getSignatureStatuses([signature])
      .send()
      .then(({ value }) => value[0])
      .catch(() => undefined)
    if (status?.err) {
      throw new Error('The cluster rejected the transaction.')
    }
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 700))
  }
  throw new Error('Sent, but not confirmed yet. Pull to refresh in a moment.')
}

function recordInstructions(signer: TransactionSendingSigner, memo: string, clock: Address) {
  return [
    getAddMemoInstruction({ memo, signers: [signer] }),
    // Zero-lamport transfer: indexes the transaction under the pact's clock address.
    getTransferSolInstruction({ amount: 0n, destination: clock, source: signer }),
  ]
}

export async function sendPunchIn(args: SendArgs & { day: number; pactId: string }) {
  const clock = await getClockAddress(args.pactId)
  const memo = encodeIn(args.pactId, args.day, args.owner)
  const result = await sendWithWallet(args, (signer) => recordInstructions(signer, memo, clock))
  return { ...result, clock, memo }
}

async function joinInstructions(
  signer: TransactionSendingSigner,
  def: PactDef,
  currentDelegated: bigint,
): Promise<Instruction[]> {
  const mint = def.mint as Address
  const [ata] = await findAssociatedTokenPda({ mint, owner: signer.address, tokenProgram: TOKEN_PROGRAM_ADDRESS })
  return [
    getCreateAssociatedTokenIdempotentInstruction({ ata, mint, owner: signer.address, payer: signer }),
    // The bond never leaves the wallet: the settler may pull at most this much, one penalty per missed shift.
    getApproveCheckedInstruction({
      amount: currentDelegated + def.bond,
      decimals: def.decimals,
      delegate: def.settler as Address,
      mint,
      owner: signer,
      source: ata,
    }),
  ]
}

/**
 * Join a pact: create the bond token account if needed, approve the settler for the bond on top of
 * any approval already held for other pacts with the same settler and mint, and record the JOIN.
 */
export async function sendJoinPact(args: SendArgs & { currentDelegated: bigint; def: PactDef }) {
  const clock = await getClockAddress(args.def.id)
  const memo = encodeJoin(args.def.id, args.owner)
  const result = await sendWithWallet(args, async (signer) => [
    ...(await joinInstructions(signer, args.def, args.currentDelegated)),
    ...recordInstructions(signer, memo, clock),
  ])
  return { ...result, clock, memo }
}

/** Define a pact on chain and join it in the same transaction: one wallet approval. */
export async function sendCreatePact(args: SendArgs & { currentDelegated: bigint; def: PactDef }) {
  const [clock, registry] = await Promise.all([getClockAddress(args.def.id), getRegistryAddress()])
  const pactMemo = encodePact(args.def)
  const joinMemo = encodeJoin(args.def.id, args.owner)
  const result = await sendWithWallet(args, async (signer) => [
    getAddMemoInstruction({ memo: pactMemo, signers: [signer] }),
    getTransferSolInstruction({ amount: 0n, destination: registry, source: signer }),
    ...(await joinInstructions(signer, args.def, args.currentDelegated)),
    ...recordInstructions(signer, joinMemo, clock),
  ])
  return { ...result, clock, memo: `[${pactMemo.length}] ${pactMemo}; [${joinMemo.length}] ${joinMemo}`, registry }
}
