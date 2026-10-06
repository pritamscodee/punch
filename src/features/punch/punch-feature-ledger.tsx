import Ionicons from '@expo/vector-icons/Ionicons'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { Pressable, View } from 'react-native'

import { useKeeperWallet } from '@/features/punch/data-access/keeper-api'
import { usePunchSettings } from '@/features/punch/data-access/punch-settings'
import { usePact } from '@/features/punch/data-access/use-pact'
import { estimateEarnings, type Ledger } from '@/features/punch/protocol/ledger'
import { PunchFeatureOnboarding } from '@/features/punch/punch-feature-onboarding'
import { formatAmount, formatStamp } from '@/features/punch/punch-format'
import { Body, ellipsify, FigureStrip, Label, Mono, Section } from '@/features/punch/ui/kit'
import { Screen, useExplorer } from '@/features/punch/ui/screen'
import { ShiftBarcode } from '@/features/punch/ui/shift-grid'
import { usePunchTheme } from '@/features/punch/ui/tokens'

type Row = {
  detail: string
  key: string
  label: string
  signature: string
  time: number
  tone: 'enamel' | 'text' | 'danger'
}

function rowsFor(ledger: Ledger, owner: string): Row[] {
  const def = ledger.def!
  const rows: Row[] = []
  for (const punches of ledger.punches.values()) {
    const mine = punches.find((punch) => punch.owner === owner)
    if (mine) {
      rows.push({
        detail: `Shift ${mine.day}`,
        key: mine.signature,
        label: 'Punch in',
        signature: mine.signature,
        time: mine.blockTime,
        tone: 'text',
      })
    }
  }
  for (const settlement of ledger.settlements.values()) {
    const punched = ledger.punches.get(settlement.day)?.some((punch) => punch.owner === owner) ?? false
    rows.push({
      detail: `${settlement.missed} out · ${settlement.punched} in · ${formatAmount(def, settlement.paid)} moved`,
      key: settlement.signature,
      label: punched && settlement.paid > 0n ? 'Settled · paid you' : 'Settled',
      signature: settlement.signature,
      time: def.origin + (settlement.day + 1) * def.period,
      tone: punched && settlement.paid > 0n ? 'enamel' : 'text',
    })
  }
  const joined = ledger.members.get(owner)
  if (joined !== undefined) {
    rows.push({ detail: 'Bond approved', key: 'join', label: 'Joined', signature: '', time: joined, tone: 'text' })
  }
  return rows.sort((a, b) => b.time - a.time)
}

export function PunchFeatureLedger() {
  const { account } = useMobileWallet()
  const { activePactId } = usePunchSettings()
  const owner = account?.address.toString() ?? null
  const pact = usePact(activePactId, owner)
  const keeper = useKeeperWallet(owner ?? undefined)
  const explorer = useExplorer()
  const { palette } = usePunchTheme()

  if (!account || !owner) {
    return (
      <Screen title="Ledger">
        <PunchFeatureOnboarding />
      </Screen>
    )
  }

  const def = pact.ledger?.def
  const stats = pact.stats
  const estimate = pact.ledger ? estimateEarnings(pact.ledger, owner) : { earned: 0n, lost: 0n }
  const pactPayouts = keeper.data?.payouts.filter((payout) => payout.pactId === def?.id)
  const earned = pactPayouts
    ? pactPayouts.filter((p) => p.toOwner === owner).reduce((sum, p) => sum + BigInt(p.amount), 0n)
    : estimate.earned
  const lost = pactPayouts
    ? pactPayouts.filter((p) => p.fromOwner === owner).reduce((sum, p) => sum + BigInt(p.amount), 0n)
    : estimate.lost
  const rows = pact.ledger && def ? rowsFor(pact.ledger, owner).slice(0, 60) : []

  return (
    <Screen
      onRefresh={() => {
        void pact.refetch()
        void keeper.refetch()
      }}
      refreshing={pact.isRefetching}
      title="Ledger"
    >
      {!def || !stats ? (
        <Body>Join a pact to start a ledger.</Body>
      ) : (
        <>
          <FigureStrip
            items={[
              { label: 'Paid shifts', value: String(stats.punched) },
              { label: 'Missed', tone: stats.missed ? 'danger' : 'text', value: String(stats.missed) },
              { label: 'Best run', value: String(stats.best) },
            ]}
          />
          <FigureStrip
            items={[
              { label: 'Earned', tone: 'enamel', value: formatAmount(def, earned).split(' ')[0] },
              { label: 'Lost', tone: lost ? 'danger' : 'text', value: formatAmount(def, lost).split(' ')[0] },
              { label: `Net ${pactPayouts ? '' : '· est'}`, value: formatAmount(def, earned - lost).split(' ')[0] },
            ]}
          />
          <Section title={`${def.name} · last 28 shifts`}>
            <ShiftBarcode recent={stats.recent} />
          </Section>
          <Section title="Records">
            {rows.length === 0 ? <Body>No records yet.</Body> : null}
            {rows.map((row, index) => (
              <Pressable
                accessibilityHint={row.signature ? 'Opens the transaction in Solana Explorer' : undefined}
                accessibilityRole={row.signature ? 'link' : undefined}
                disabled={!row.signature}
                key={row.key}
                onPress={() => explorer(`/tx/${row.signature}`)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? palette.inset : 'transparent',
                  borderTopColor: palette.hairline,
                  borderTopWidth: index === 0 ? 0 : 1,
                  gap: 3,
                  paddingVertical: 10,
                })}
              >
                <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Label size={14} tone={row.tone}>
                    {row.label}
                  </Label>
                  <Mono size={12} tone="muted">
                    {formatStamp(row.time)}
                  </Mono>
                </View>
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'space-between' }}>
                  <Body style={{ flex: 1, fontSize: 13 }}>{row.detail}</Body>
                  {row.signature ? (
                    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 4 }}>
                      <Mono size={12} tone="muted">
                        {ellipsify(row.signature, 5)}
                      </Mono>
                      <Ionicons color={palette.muted} name="open-outline" size={13} />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </Section>
          <Body style={{ fontSize: 12, textAlign: 'center' }}>
            Every row is a Solana transaction. Earned and lost come from the keeper&apos;s settlement records
            {pactPayouts ? '' : ' (keeper offline: estimated from on-chain settle records)'}.
          </Body>
        </>
      )}
    </Screen>
  )
}
