import Ionicons from '@expo/vector-icons/Ionicons'
import type { Address } from '@solana/kit'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, View } from 'react-native'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'
import { updatePunchSettings, usePunchSettings } from '@/features/punch/data-access/punch-settings'
import { useBondAccount, usePact } from '@/features/punch/data-access/use-pact'
import { useFaucet, useJoinPact } from '@/features/punch/data-access/use-punch-actions'
import { findBondAsset } from '@/features/punch/protocol/constants'
import { dayStart, type PactDef } from '@/features/punch/protocol/records'
import { PunchFeatureOnboarding } from '@/features/punch/punch-feature-onboarding'
import { assetSymbol, formatAmount, formatClock, isTrustedSettler } from '@/features/punch/punch-format'
import {
  Body,
  ellipsify,
  formatCountdown,
  formatPeriod,
  Heading,
  KeyButton,
  Label,
  Notice,
  Section,
  SpecRow,
} from '@/features/punch/ui/kit'
import { Screen, useExplorer } from '@/features/punch/ui/screen'
import { usePunchTheme } from '@/features/punch/ui/tokens'
import { formatError } from '@/features/wallet/util/format-error'

export function PunchFeaturePact({ id }: { id: string }) {
  const { account } = useMobileWallet()
  const owner = account?.address.toString() ?? null
  const pact = usePact(id, owner)

  return (
    <Screen onRefresh={() => void pact.refetch()} refreshing={pact.isRefetching} title={id}>
      {pact.isLoading ? (
        <Label>Reading the clock…</Label>
      ) : !pact.ledger?.def || !pact.stats ? (
        <View style={{ gap: 12 }}>
          <Heading size={36}>No pact {id}</Heading>
          <Body>Nothing is registered under this code on the selected cluster. Check the code, or switch cluster.</Body>
        </View>
      ) : (
        <PactTerms
          def={pact.ledger.def}
          isMember={pact.stats.isMember}
          members={pact.ledger.members.size}
          now={pact.now}
          owner={account?.address as Address | undefined}
          closesAt={pact.stats.closesAt}
        />
      )}
      {!account ? <PunchFeatureOnboarding /> : null}
    </Screen>
  )
}

function PactTerms({
  closesAt,
  def,
  isMember,
  members,
  now,
  owner,
}: {
  closesAt: number
  def: PactDef
  isMember: boolean
  members: number
  now: number
  owner: Address | undefined
}) {
  const { palette } = usePunchTheme()
  const router = useRouter()
  const explorer = useExplorer()
  const { cluster } = useAppCluster()
  const { activePactId } = usePunchSettings()
  const bond = useBondAccount(owner, def.mint)
  const held = bond.data?.delegate === def.settler ? bond.data.delegatedAmount : 0n
  const join = useJoinPact(def, held)
  const faucet = useFaucet()
  const [status, setStatus] = useState<{ message: string; tone: 'danger' | 'enamel' } | null>(null)

  const trusted = isTrustedSettler(def)
  const asset = findBondAsset(def.mint)
  const balance = bond.data?.amount ?? 0n
  const short = balance < held + def.bond
  const canFaucet = asset?.cluster === 'devnet' && cluster.id === 'solana:devnet'

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <Label size={12}>Pact · {def.id}</Label>
        <Heading size={44}>{def.name}</Heading>
      </View>

      <Section title="Terms">
        <SpecRow label="Bond" value={formatAmount(def, def.bond)} />
        <SpecRow label="Per missed shift" tone="enamel" value={formatAmount(def, def.penalty)} />
        <SpecRow label="Covers" value={`${Number(def.bond / (def.penalty || 1n))} misses`} />
        <SpecRow label="Shift length" value={formatPeriod(def.period)} />
        <SpecRow label="This shift closes" value={`${formatClock(closesAt)} · ${formatCountdown(closesAt - now)}`} />
        <SpecRow label="Members" value={String(members)} />
        <SpecRow label="Asset" value={asset ? `${asset.symbol} · ${asset.name}` : ellipsify(def.mint)} />
        <SpecRow
          label="Settler"
          last
          value={
            <Pressable
              accessibilityRole="link"
              onPress={() => explorer(`/address/${def.settler}`)}
              style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}
            >
              <Ionicons
                color={trusted ? palette.enamel : palette.danger}
                name={trusted ? 'shield-checkmark' : 'warning'}
                size={15}
              />
              <Label size={13} tone={trusted ? 'text' : 'danger'}>
                {trusted ? 'PUNCH keeper' : ellipsify(def.settler)}
              </Label>
            </Pressable>
          }
        />
      </Section>

      {!trusted ? (
        <Notice
          message={`This pact names a settler that is not the PUNCH keeper. Joining lets that address take up to ${formatAmount(def, def.bond)} from your wallet. Only join if you know who runs it.`}
          tone="danger"
        />
      ) : null}

      {asset?.symbol === 'tSKR' ? (
        <Body style={{ fontSize: 13 }}>
          tSKR is the devnet stand-in for SKR, free from the faucet. On mainnet, pacts bond real SKR.
        </Body>
      ) : null}

      <Section title="How the bond works">
        <Body>
          Joining approves the settler to move up to {formatAmount(def, def.bond)} from your {assetSymbol(def)} account.
          The tokens stay in your wallet. When a shift closes, each member who did not punch in loses{' '}
          {formatAmount(def, def.penalty)}, split between the members who did. Shift{' '}
          {Math.floor((now - def.origin) / def.period)} opened{' '}
          {formatClock(dayStart(def, Math.floor((now - def.origin) / def.period)))}.
        </Body>
      </Section>

      {owner ? (
        <View style={{ gap: 10 }}>
          {short && canFaucet ? (
            <KeyButton
              icon={<Ionicons color={palette.text} name="water" size={18} />}
              loading={faucet.isPending}
              onPress={() => {
                setStatus(null)
                faucet.mutate(undefined, {
                  onError: (e) => setStatus({ message: formatError(e), tone: 'danger' }),
                  onSuccess: (r) =>
                    setStatus({
                      message: `Received ${formatAmount(def, r.tokens)}${r.lamports ? ' and 0.05 SOL for fees' : ''}.`,
                      tone: 'enamel',
                    }),
                })
              }}
            >
              Get test tSKR
            </KeyButton>
          ) : null}
          {short && !canFaucet ? (
            <Notice message={`You need ${formatAmount(def, def.bond)} available to bond this pact.`} tone="danger" />
          ) : null}
          <KeyButton
            disabled={short || bond.isLoading}
            loading={join.isPending}
            onPress={() => {
              setStatus(null)
              join.mutate(undefined, {
                onError: (e) => setStatus({ message: formatError(e), tone: 'danger' }),
                onSuccess: () => router.replace('/'),
              })
            }}
            variant="enamel"
          >
            {isMember ? `Top up bond +${formatAmount(def, def.bond)}` : `Bond ${formatAmount(def, def.bond)} & join`}
          </KeyButton>
          {isMember && activePactId !== def.id ? (
            <KeyButton
              onPress={() => {
                updatePunchSettings({ activePactId: def.id })
                router.replace('/')
              }}
            >
              Put this card in the clock
            </KeyButton>
          ) : null}
          {status ? <Notice message={status.message} tone={status.tone} /> : null}
        </View>
      ) : null}
    </View>
  )
}
