import { useQuery } from '@tanstack/react-query'

import { usePunchSettings } from '@/features/punch/data-access/punch-settings'

export class KeeperError extends Error {}

async function keeperFetch<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
      signal: controller.signal,
    })
    const body = (await response.json().catch(() => ({}))) as T & { error?: string }
    if (!response.ok) {
      throw new KeeperError(body.error ?? `Keeper responded ${response.status}`)
    }
    return body
  } catch (error) {
    if (error instanceof KeeperError) {
      throw error
    }
    throw new KeeperError('Keeper unreachable. Check the URL in Settings.')
  } finally {
    clearTimeout(timeout)
  }
}

export type KeeperPactSummary = {
  atRiskToday: number
  closesAt: number
  currentDay: number
  id: string
  members: number
  /** owner -> first sorted .skr name. Display beside the address, never instead of it. */
  names: Record<string, string>
  punchedToday: number
  seekers: string[]
}

export type KeeperPayout = {
  amount: number
  day: number
  fromOwner: string
  pactId: string
  signature: string
  toOwner: string
}

export type KeeperWallet = { earned: number; lost: number; owner: string; payouts: KeeperPayout[] }

export type FaucetResult = { lamports: number; signature: string; tokens: number }

export function requestFaucet(baseUrl: string, owner: string) {
  return keeperFetch<FaucetResult>(baseUrl, '/v1/faucet', { body: JSON.stringify({ owner }), method: 'POST' })
}

export function fetchKeeperHealth(baseUrl: string) {
  return keeperFetch<{ keeper: string; ok: boolean; store: string }>(baseUrl, '/health')
}

/** Keeper's verified view of a pact; includes Seeker Genesis Token holders. Optional enrichment. */
export function useKeeperPact(pactId: string | null) {
  const { keeperUrl } = usePunchSettings()
  return useQuery({
    enabled: !!pactId,
    queryFn: () => keeperFetch<KeeperPactSummary>(keeperUrl, `/v1/pacts/${pactId}`),
    queryKey: ['keeper-pact', keeperUrl, pactId],
    refetchInterval: 60_000,
    retry: 1,
  })
}

/** Exact payouts the keeper settled to and from a wallet. */
export function useKeeperWallet(owner: string | undefined) {
  const { keeperUrl } = usePunchSettings()
  return useQuery({
    enabled: !!owner,
    queryFn: () => keeperFetch<KeeperWallet>(keeperUrl, `/v1/wallets/${owner}`),
    queryKey: ['keeper-wallet', keeperUrl, owner],
    retry: 1,
  })
}
