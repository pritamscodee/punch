import type { Address } from '@solana/kit'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, useWindowDimensions, View } from 'react-native'

import { useKeeperPact } from '@/features/punch/data-access/keeper-api'
import { usePunchSettings } from '@/features/punch/data-access/punch-settings'
import { ensureReminderPermission, syncShiftReminders } from '@/features/punch/data-access/reminders'
import { useBondAccount, usePact } from '@/features/punch/data-access/use-pact'
import { usePunchIn } from '@/features/punch/data-access/use-punch-actions'
import { eligibleMembers, type Ledger, type MemberStats } from '@/features/punch/protocol/ledger'
import type { PactDef } from '@/features/punch/protocol/records'
import { PunchFeatureOnboarding } from '@/features/punch/punch-feature-onboarding'
import { formatAmount, formatClock, runUnit } from '@/features/punch/punch-format'
import { Gauge } from '@/features/punch/ui/gauge'
import { ShiftBand } from '@/features/punch/ui/hazard-band'
import { Body, Heading, KeyButton, Label, Mono, Notice, Plate, Section, SpecRow } from '@/features/punch/ui/kit'
import { PunchKey, type PunchKeyState } from '@/features/punch/ui/punch-key'
import { Screen } from '@/features/punch/ui/screen'
import { ShiftGrid } from '@/features/punch/ui/shift-grid'
import { usePunchTheme } from '@/features/punch/ui/tokens'
import { formatError } from '@/features/wallet/util/format-error'

export function PunchFeatureClock() {
  const { account } = useMobileWallet()
  const { activePactId } = usePunchSettings()
  const owner = account?.address.toString() ?? null
  const pact = usePact(activePactId, owner)

  return (
    <Screen onRefresh={account ? () => void pact.refetch() : undefined} refreshing={pact.isRefetching}>
      {!account ? (
        <PunchFeatureOnboarding />
      ) : pact.isLoading ? (
        <Plate style={{ padding: 20 }}>
          <Label>Reading the clock…</Label>
        </Plate>
      ) : pact.isError ? (
        <Notice message={`Could not read the clock: ${formatError(pact.error)}`} tone="danger" />
      ) : !pact.ledger?.def || !pact.stats ? (
        <NoCard pactId={activePactId} />
      ) : !pact.stats.isMember ? (
        <NotOnClock def={pact.ledger.def} />
      ) : (
        <ClockFace
          def={pact.ledger.def}
          ledger={pact.ledger}
          now={pact.now}
          owner={account.address as Address}
          stats={pact.stats}
        />
      )}
    </Screen>
  )
}

function NoCard({ pactId }: { pactId: string | null }) {
  const router = useRouter()
  return (
    <View style={{ gap: 16 }}>
      <Heading size={40}>No card in the clock</Heading>
      <Body>
        {pactId
          ? `Pact ${pactId} does not exist on this cluster yet. Pick a floor to join, or start your own.`
          : 'Pick a floor to join, or start your own pact.'}
      </Body>
      <KeyButton onPress={() => router.push('/floor')} variant="enamel">
        Find a floor
      </KeyButton>
    </View>
  )
}

function NotOnClock({ def }: { def: PactDef }) {
  const router = useRouter()
  return (
    <View style={{ gap: 16 }}>
      <Label>Not on this clock</Label>
      <Heading size={44}>{def.name}</Heading>
      <Body>
        Bond {formatAmount(def, def.bond)}. Every missed shift pays {formatAmount(def, def.penalty)} to the members who
        punched in.
      </Body>
      <KeyButton onPress={() => router.push(`/pact/${def.id}`)} variant="enamel">
        {`Join ${def.id}`}
      </KeyButton>
      <KeyButton onPress={() => router.push('/floor')}>Other floors</KeyButton>
    </View>
  )
}

function ClockFace({
  def,
  ledger,
  now,
  owner,
  stats,
}: {
  def: PactDef
  ledger: Ledger
  now: number
  owner: Address
  stats: MemberStats
}) {
  const { palette } = usePunchTheme()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const { remindersEnabled } = usePunchSettings()
  const punch = usePunchIn(def)
  const bond = useBondAccount(owner, def.mint)
  const keeper = useKeeperPact(def.id)
  const [error, setError] = useState<string | null>(null)

  const punchedAt = stats.punchedToday ? formatClock(stats.punchedToday.blockTime) : null
  const closesIn = stats.closesAt - now
  const bondHeld = bond.data && bond.data.delegate === def.settler ? bond.data.delegatedAmount : 0n
  const bonded = bondHeld >= def.penalty && (bond.data?.amount ?? 0n) >= def.penalty
  const eligible = eligibleMembers(ledger, stats.currentDay)
  const punchedToday = ledger.punches.get(stats.currentDay) ?? []
  const absent = eligible.filter((member) => !punchedToday.some((p) => p.owner === member))
  const shiftNumber = stats.firstDay === null ? 0 : stats.currentDay - stats.firstDay + 1

  // Re-plan reminders whenever the shift or its state changes.
  useEffect(() => {
    void (async () => {
      if (remindersEnabled) {
        await ensureReminderPermission()
      }
      await syncShiftReminders({
        closesAt: stats.closesAt,
        enabled: remindersEnabled,
        pactName: def.name,
        penalty: formatAmount(def, def.penalty),
        period: def.period,
        punchedToday: !!stats.punchedToday,
      })
    })().catch(() => undefined)
  }, [def, remindersEnabled, stats.closesAt, stats.punchedToday])

  const keyState: PunchKeyState = punchedAt
    ? { at: punchedAt, kind: 'paid' }
    : punch.isPending
      ? { kind: 'busy', label: 'Stamping…' }
      : { kind: 'ready' }

  return (
    <View style={{ gap: 16 }}>
      <Pressable
        accessibilityHint="Opens the floor"
        accessibilityRole="button"
        onPress={() => router.push('/floor')}
        style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}
      >
        <View style={{ flex: 1 }}>
          <Label size={12}>Pact · {def.id}</Label>
          <Heading numberOfLines={1} size={26}>
            {def.name}
          </Heading>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Mono bold size={16}>
            {punchedToday.length}/{Math.max(eligible.length, punchedToday.length)}
          </Mono>
          <Label size={11}>On the floor</Label>
        </View>
      </Pressable>

      <Gauge
        best={stats.best}
        size={Math.min(width - 32, 340)}
        unit={runUnit(def, stats.streak)}
        value={stats.streak}
      />

      <Plate
        inset
        style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 }}
      >
        <Mono size={13} tone="muted">
          SHIFT <Mono size={13}>{shiftNumber}</Mono>
        </Mono>
        <Mono size={13} tone="muted">
          BEST <Mono size={13}>{stats.best}</Mono>
        </Mono>
        <Mono size={13} tone="muted">
          MISSED{' '}
          <Mono size={13} tone={stats.missed ? 'danger' : 'text'}>
            {stats.missed}
          </Mono>
        </Mono>
      </Plate>

      <ShiftBand closesIn={closesIn} paidAt={punchedAt} penalty={formatAmount(def, def.penalty)} />

      <PunchKey
        onPress={() => {
          setError(null)
          punch.mutate(undefined, { onError: (e) => setError(formatError(e)) })
        }}
        state={keyState}
      />
      {error ? <Notice message={error} tone="danger" /> : null}
      {stats.firstDay !== null && stats.currentDay < stats.firstDay ? (
        <Notice message="You joined mid-shift. This one is practice; you are on the hook from the next shift." />
      ) : null}

      <ShiftGrid def={def} recent={stats.recent} />

      <Section
        action={
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/ledger')}>
            <Label size={12} tone="enamel">
              Ledger ›
            </Label>
          </Pressable>
        }
        title="Load plate"
      >
        <SpecRow label="Bond held" tone={bonded ? 'text' : 'danger'} value={formatAmount(def, bondHeld)} />
        <SpecRow label="Per missed shift" value={formatAmount(def, def.penalty)} />
        <SpecRow
          label="Pot from no-shows"
          tone={absent.length && !punchedAt ? 'muted' : 'enamel'}
          value={formatAmount(def, def.penalty * BigInt(absent.length))}
        />
        <SpecRow
          label="Seekers on the floor"
          last
          value={keeper.data ? `${keeper.data.seekers.length} / ${keeper.data.members}` : '—'}
        />
      </Section>

      {!bonded && bond.data ? (
        <View style={{ gap: 10 }}>
          <Notice
            message="Your bond cannot cover a penalty. You can still punch, but you are not paid from other members' misses until you top it up."
            tone="danger"
          />
          <KeyButton onPress={() => router.push(`/pact/${def.id}`)}>Top up bond</KeyButton>
        </View>
      ) : null}

      <Body style={{ color: palette.dim, fontSize: 12, textAlign: 'center' }}>
        Shift closes {formatClock(stats.closesAt)} · settled by the keeper from on-chain records
      </Body>
    </View>
  )
}
