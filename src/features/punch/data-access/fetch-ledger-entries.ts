import type { Address, Signature } from '@solana/kit'

import type { SolanaClient } from '@/features/cluster/data-access/create-solana-client'
import { punchStorage } from '@/features/punch/data-access/punch-settings'
import type { LedgerEntry } from '@/features/punch/protocol/ledger'
import { parseMemoField } from '@/features/punch/protocol/records'

type StoredEntry = { blockTime: number; memo: string; signature: string }
type StoredHistory = { entries: StoredEntry[]; newest: string | null }

const PAGE = 1000
const MAX_ENTRIES = 20_000

function read(key: string): StoredHistory {
  try {
    const raw = punchStorage.getString(key)
    return raw ? (JSON.parse(raw) as StoredHistory) : { entries: [], newest: null }
  } catch {
    return { entries: [], newest: null }
  }
}

/**
 * Full PUNCH history of an address (a clock or the registry). Signatures are immutable, so the
 * history is cached on device and each refresh only asks the RPC for what is newer than the cache.
 */
export async function fetchLedgerEntries({
  address,
  client,
  clusterId,
}: {
  address: Address
  client: SolanaClient
  clusterId: string
}): Promise<LedgerEntry[]> {
  const key = `punch:history:${clusterId}:${address}`
  const stored = read(key)
  const fresh: StoredEntry[] = []
  let before: Signature | undefined
  let newest: string | null = stored.newest

  for (;;) {
    const page = await client.rpc
      .getSignaturesForAddress(address, {
        before,
        commitment: 'confirmed',
        limit: PAGE,
        until: (stored.newest ?? undefined) as Signature | undefined,
      })
      .send()
    if (!before && page[0]) {
      newest = page[0].signature
    }
    for (const info of page) {
      if (info.err === null && info.memo && info.memo.includes('PUNCH1|')) {
        fresh.push({ blockTime: Number(info.blockTime ?? 0), memo: info.memo, signature: info.signature })
      }
    }
    if (page.length < PAGE || stored.entries.length + fresh.length >= MAX_ENTRIES) {
      break
    }
    before = page[page.length - 1].signature
  }

  // Entries remembered optimistically come back from the RPC as fresh ones; keep one of each.
  const seen = new Set(fresh.map((entry) => entry.signature))
  const entries = [...fresh.reverse(), ...stored.entries.filter((entry) => !seen.has(entry.signature))]
  if (fresh.length || newest !== stored.newest) {
    punchStorage.set(key, JSON.stringify({ entries, newest } satisfies StoredHistory))
  }
  return entries.map((entry) => ({ ...entry, records: parseMemoField(entry.memo) }))
}

/** Add a just-confirmed transaction to the cached history so the UI does not wait for the next poll. */
export function rememberLedgerEntry({
  address,
  clusterId,
  entry,
}: {
  address: Address
  clusterId: string
  entry: StoredEntry
}) {
  const key = `punch:history:${clusterId}:${address}`
  const stored = read(key)
  if (stored.entries.some((item) => item.signature === entry.signature)) {
    return
  }
  // `newest` is left alone so the next fetch still pages back over this signature's neighbours.
  punchStorage.set(key, JSON.stringify({ ...stored, entries: [...stored.entries, entry] } satisfies StoredHistory))
}
