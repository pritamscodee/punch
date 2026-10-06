import type { Address } from '@solana/kit'
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'
import { fetchLedgerEntries } from '@/features/punch/data-access/fetch-ledger-entries'
import { getClockAddress, getRegistryAddress } from '@/features/punch/protocol/addresses'
import { buildLedger, memberStats } from '@/features/punch/protocol/ledger'
import type { PactDef } from '@/features/punch/protocol/records'

/** Unix seconds, ticking. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function pactQueryKey(clusterId: string, pactId: string | null) {
  return ['punch-pact', clusterId, pactId] as const
}

/** The full on-chain history of a pact, refreshed every 20 seconds while mounted. */
export function usePactLedger(pactId: string | null) {
  const { client, cluster } = useAppCluster()
  return useQuery({
    enabled: !!pactId,
    queryFn: async () => {
      const address = await getClockAddress(pactId!)
      const entries = await fetchLedgerEntries({ address, client, clusterId: cluster.id })
      return { clock: address, entries, ledger: buildLedger(pactId!, entries) }
    },
    queryKey: pactQueryKey(cluster.id, pactId),
    refetchInterval: 20_000,
  })
}

/** One pact, seen by one owner, at the current second. */
export function usePact(pactId: string | null, owner: string | null) {
  const query = usePactLedger(pactId)
  const now = useNow()
  const ledger = query.data?.ledger ?? null
  const stats = useMemo(() => (ledger ? memberStats(ledger, owner, now) : null), [ledger, owner, now])
  return { ...query, ledger, now, stats }
}

/** Every pact defined on this cluster, oldest first. */
export function useRegistry() {
  const { client, cluster } = useAppCluster()
  return useQuery({
    queryFn: async () => {
      const address = await getRegistryAddress()
      const entries = await fetchLedgerEntries({ address, client, clusterId: cluster.id })
      const seen = new Set<string>()
      const defs: PactDef[] = []
      for (const entry of [...entries].sort((a, b) => a.blockTime - b.blockTime)) {
        for (const record of entry.records) {
          if (record.kind === 'pact' && !seen.has(record.def.id)) {
            seen.add(record.def.id)
            defs.push(record.def)
          }
        }
      }
      return defs
    },
    queryKey: ['punch-registry', cluster.id],
    refetchInterval: 60_000,
  })
}

export type BondAccount = {
  address: Address
  amount: bigint
  delegate: string | null
  delegatedAmount: bigint
  exists: boolean
}

type ParsedTokenAccount = {
  parsed?: {
    info?: {
      delegate?: string
      delegatedAmount?: { amount: string }
      tokenAmount?: { amount: string }
    }
  }
}

/** The owner's token account for a mint: balance and the approval held by the settler. */
export function useBondAccount(owner: Address | undefined, mint: string | undefined) {
  const { client, cluster } = useAppCluster()
  return useQuery({
    enabled: !!owner && !!mint,
    queryFn: async (): Promise<BondAccount> => {
      const [address] = await findAssociatedTokenPda({
        mint: mint as Address,
        owner: owner!,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      })
      const { value } = await client.rpc
        .getAccountInfo(address, { commitment: 'confirmed', encoding: 'jsonParsed' })
        .send()
      const info = (value?.data as ParsedTokenAccount | undefined)?.parsed?.info
      return {
        address,
        amount: BigInt(info?.tokenAmount?.amount ?? '0'),
        delegate: info?.delegate ?? null,
        delegatedAmount: BigInt(info?.delegatedAmount?.amount ?? '0'),
        exists: !!value,
      }
    },
    queryKey: ['punch-bond', cluster.id, owner, mint],
    refetchInterval: 30_000,
  })
}

export function formatUnits(amount: bigint, decimals: number, maxFraction = 2) {
  const negative = amount < 0n
  const value = negative ? -amount : amount
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = (value % base).toString().padStart(decimals, '0').slice(0, maxFraction).replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole.toLocaleString()}${fraction ? `.${fraction}` : ''}`
}

export function parseUnits(text: string, decimals: number) {
  const [whole, fraction = ''] = text.trim().split('.')
  if (!/^\d+$/.test(whole || '0') || !/^\d*$/.test(fraction)) {
    return null
  }
  return (
    BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fraction.slice(0, decimals).padEnd(decimals, '0') || '0')
  )
}
