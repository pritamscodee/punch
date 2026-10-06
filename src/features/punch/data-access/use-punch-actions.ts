import type { Address } from '@solana/kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import * as Haptics from 'expo-haptics'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'
import { rememberLedgerEntry } from '@/features/punch/data-access/fetch-ledger-entries'
import { requestFaucet } from '@/features/punch/data-access/keeper-api'
import { updatePunchSettings, usePunchSettings } from '@/features/punch/data-access/punch-settings'
import { sendCreatePact, sendJoinPact, sendPunchIn } from '@/features/punch/data-access/send-punch-transaction'
import { pactQueryKey } from '@/features/punch/data-access/use-pact'
import { getClockAddress } from '@/features/punch/protocol/addresses'
import { dayAt, type PactDef } from '@/features/punch/protocol/records'

function memoField(memo: string) {
  return memo.startsWith('[') ? memo : `[${memo.length}] ${memo}`
}

function useActionContext() {
  const wallet = useMobileWallet()
  const { client, cluster } = useAppCluster()
  const queryClient = useQueryClient()
  const owner = wallet.account?.address as Address | undefined

  function requireOwner() {
    if (!owner) {
      throw new Error('Connect a wallet first.')
    }
    return owner
  }

  function remember(
    pactId: string,
    result: { clock: Address; memo: string; memoBlockTime: number; signature: string },
  ) {
    rememberLedgerEntry({
      address: result.clock,
      clusterId: cluster.id,
      entry: { blockTime: result.memoBlockTime, memo: memoField(result.memo), signature: result.signature },
    })
    void queryClient.invalidateQueries({ queryKey: pactQueryKey(cluster.id, pactId) })
    void queryClient.invalidateQueries({ queryKey: ['punch-bond'] })
  }

  return { client, cluster, getTransactionSigner: wallet.getTransactionSigner, queryClient, remember, requireOwner }
}

export function usePunchIn(def: PactDef | null) {
  const ctx = useActionContext()
  return useMutation({
    mutationFn: async () => {
      if (!def) {
        throw new Error('No pact selected.')
      }
      const owner = ctx.requireOwner()
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
      const result = await sendPunchIn({
        client: ctx.client,
        day: dayAt(def, Math.floor(Date.now() / 1000)),
        getTransactionSigner: ctx.getTransactionSigner,
        owner,
        pactId: def.id,
      })
      ctx.remember(def.id, result)
      return result
    },
    onError: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  })
}

export function useJoinPact(def: PactDef | null, currentDelegated: bigint) {
  const ctx = useActionContext()
  return useMutation({
    mutationFn: async () => {
      if (!def) {
        throw new Error('Pact not found on this cluster.')
      }
      const owner = ctx.requireOwner()
      const result = await sendJoinPact({
        client: ctx.client,
        currentDelegated,
        def,
        getTransactionSigner: ctx.getTransactionSigner,
        owner,
      })
      ctx.remember(def.id, result)
      updatePunchSettings({ activePactId: def.id })
      return result
    },
    onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  })
}

export function useCreatePact(currentDelegated: bigint) {
  const ctx = useActionContext()
  return useMutation({
    mutationFn: async (def: PactDef) => {
      const owner = ctx.requireOwner()
      // A pact id is first come, first served: the first PACT record on a clock defines it.
      const clock = await getClockAddress(def.id)
      const existing = await ctx.client.rpc.getSignaturesForAddress(clock, { limit: 1 }).send()
      if (existing.length > 0) {
        throw new Error(`Code ${def.id} is taken. Pick another.`)
      }
      const result = await sendCreatePact({
        client: ctx.client,
        currentDelegated,
        def,
        getTransactionSigner: ctx.getTransactionSigner,
        owner,
      })
      ctx.remember(def.id, result)
      void ctx.queryClient.invalidateQueries({ queryKey: ['punch-registry'] })
      updatePunchSettings({ activePactId: def.id })
      return result
    },
    onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  })
}

export function useFaucet() {
  const ctx = useActionContext()
  const { keeperUrl } = usePunchSettings()
  return useMutation({
    mutationFn: async () => {
      const owner = ctx.requireOwner()
      const result = await requestFaucet(keeperUrl, owner)
      void ctx.queryClient.invalidateQueries({ queryKey: ['punch-bond'] })
      void ctx.queryClient.invalidateQueries({ queryKey: ['get-balance'] })
      return result
    },
    onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  })
}
