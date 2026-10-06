import Ionicons from '@expo/vector-icons/Ionicons'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import * as Clipboard from 'expo-clipboard'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Share, TextInput, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import { useKeeperPact } from '@/features/punch/data-access/keeper-api'
import { usePunchSettings } from '@/features/punch/data-access/punch-settings'
import { usePact, useRegistry } from '@/features/punch/data-access/use-pact'
import { eligibleMembers, type Ledger } from '@/features/punch/protocol/ledger'
import { isValidPactId, type PactDef } from '@/features/punch/protocol/records'
import { formatAmount, formatClock, isTrustedSettler } from '@/features/punch/punch-format'
import { Body, ellipsify, formatPeriod, KeyButton, Label, Mono, Notice, Section } from '@/features/punch/ui/kit'
import { Screen } from '@/features/punch/ui/screen'
import { usePunchTheme } from '@/features/punch/ui/tokens'

export function PunchFeatureFloor() {
  const { account } = useMobileWallet()
  const { activePactId } = usePunchSettings()
  const owner = account?.address.toString() ?? null
  const pact = usePact(activePactId, owner)
  const registry = useRegistry()

  return (
    <Screen
      onRefresh={() => {
        void pact.refetch()
        void registry.refetch()
      }}
      refreshing={pact.isRefetching || registry.isRefetching}
      title="Floor"
    >
      {pact.ledger?.def && pact.stats ? (
        <>
          <Roster currentDay={pact.stats.currentDay} ledger={pact.ledger} owner={owner} />
          <Invite def={pact.ledger.def} />
        </>
      ) : null}
      <PactList activeId={activePactId} defs={registry.data ?? []} loading={registry.isLoading} />
      <JoinByCode />
    </Screen>
  )
}

function Roster({ currentDay, ledger, owner }: { currentDay: number; ledger: Ledger; owner: string | null }) {
  const { palette } = usePunchTheme()
  const def = ledger.def!
  const keeper = useKeeperPact(def.id)
  const seekers = new Set(keeper.data?.seekers ?? [])
  const punches = ledger.punches.get(currentDay) ?? []
  const eligible = new Set(eligibleMembers(ledger, currentDay))
  const members = [...ledger.members.keys()]
  const rows = members
    .map((member) => ({
      member,
      onHook: eligible.has(member),
      punch: punches.find((p) => p.owner === member) ?? null,
    }))
    .sort((a, b) => (a.punch && b.punch ? a.punch.blockTime - b.punch.blockTime : a.punch ? -1 : b.punch ? 1 : 0))
  const absent = rows.filter((row) => row.onHook && !row.punch).length

  return (
    <Section
      action={
        <Mono size={13} tone="muted">
          {punches.length}/{members.length} in
        </Mono>
      }
      title={`${def.name} · today`}
    >
      {rows.length === 0 ? <Body>No members yet. Share the code below.</Body> : null}
      {rows.map((row, index) => (
        <View
          key={row.member}
          style={{
            alignItems: 'center',
            borderTopColor: palette.hairline,
            borderTopWidth: index === 0 ? 0 : 1,
            flexDirection: 'row',
            gap: 10,
            minHeight: 44,
          }}
        >
          <View
            style={{
              backgroundColor: row.punch ? palette.enamel : 'transparent',
              borderColor: row.punch ? palette.enamel : row.onHook ? palette.danger : palette.dim,
              borderWidth: 2,
              height: 12,
              width: 12,
            }}
          />
          <View style={{ flex: 1 }}>
            {keeper.data?.names[row.member] ? (
              <Label numberOfLines={1} size={14} tone="text">
                {keeper.data.names[row.member]}
              </Label>
            ) : null}
            <Mono size={keeper.data?.names[row.member] ? 12 : 14} tone={row.member === owner ? 'enamel' : 'muted'}>
              {ellipsify(row.member, 5)}
              {row.member === owner ? '  YOU' : ''}
            </Mono>
          </View>
          {seekers.has(row.member) ? (
            <View style={{ borderColor: palette.enamel, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Label size={10} tone="enamel">
                Seeker
              </Label>
            </View>
          ) : null}
          <Mono size={13} tone={row.punch ? 'text' : row.onHook ? 'danger' : 'dim'}>
            {row.punch ? formatClock(row.punch.blockTime) : row.onHook ? 'OUT' : 'NEXT SHIFT'}
          </Mono>
        </View>
      ))}
      {absent > 0 ? (
        <View style={{ borderTopColor: palette.hairline, borderTopWidth: 1, gap: 2, paddingTop: 10 }}>
          <Label size={12} tone="enamel">
            {absent} out · {formatAmount(def, def.penalty * BigInt(absent))} on the table
          </Label>
          <Body style={{ fontSize: 13 }}>Split between everyone who punched in when the shift closes.</Body>
        </View>
      ) : null}
    </Section>
  )
}

function Invite({ def }: { def: PactDef }) {
  const { palette } = usePunchTheme()
  const [copied, setCopied] = useState(false)
  const link = Linking.createURL(`/pact/${def.id}`)

  return (
    <Section title="Bring someone in">
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 16 }}>
        <View style={{ backgroundColor: '#FFFFFF', padding: 8 }}>
          <QRCode backgroundColor="#FFFFFF" color="#14161A" size={112} value={link} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Label size={12}>Pact code</Label>
          <Mono bold selectable size={30} tone="enamel">
            {def.id}
          </Mono>
          <Body style={{ fontSize: 13 }}>Scan with a phone camera, or enter the code on the floor.</Body>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <View style={{ flex: 1 }}>
          <KeyButton
            icon={<Ionicons color={palette.text} name="share-social" size={18} />}
            onPress={() =>
              void Share.share({
                message: `Clock in with me on PUNCH. ${def.name}: miss a shift, pay the ones who showed up. Code ${def.id} · ${link}`,
              })
            }
          >
            Share
          </KeyButton>
        </View>
        <View style={{ flex: 1 }}>
          <KeyButton
            icon={<Ionicons color={palette.text} name={copied ? 'checkmark' : 'copy'} size={18} />}
            onPress={() => {
              void Clipboard.setStringAsync(link)
              setCopied(true)
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </KeyButton>
        </View>
      </View>
    </Section>
  )
}

function PactList({ activeId, defs, loading }: { activeId: string | null; defs: PactDef[]; loading: boolean }) {
  const { palette } = usePunchTheme()
  const router = useRouter()

  return (
    <Section
      action={
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/pact/new')}>
          <Label size={12} tone="enamel">
            + New pact
          </Label>
        </Pressable>
      }
      title="Floors"
    >
      {loading ? <Label>Reading registry…</Label> : null}
      {!loading && defs.length === 0 ? <Body>No pacts on this cluster yet. Start the first one.</Body> : null}
      {defs.map((def, index) => {
        const active = def.id === activeId
        return (
          <Pressable
            accessibilityRole="button"
            key={def.id}
            onPress={() => router.push(`/pact/${def.id}`)}
            style={({ pressed }) => ({
              alignItems: 'center',
              backgroundColor: pressed ? palette.inset : 'transparent',
              borderTopColor: palette.hairline,
              borderTopWidth: index === 0 ? 0 : 1,
              flexDirection: 'row',
              gap: 12,
              minHeight: 60,
            })}
          >
            <View style={{ backgroundColor: active ? palette.enamel : palette.line, height: 36, width: 4 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Label numberOfLines={1} size={16} tone="text">
                {def.name}
              </Label>
              <Mono size={12} tone="muted">
                {def.id} · {formatPeriod(def.period)} SHIFTS · {formatAmount(def, def.penalty)}/MISS
              </Mono>
            </View>
            {!isTrustedSettler(def) ? <Ionicons color={palette.danger} name="warning" size={16} /> : null}
            <Ionicons color={palette.muted} name="chevron-forward" size={18} />
          </Pressable>
        )
      })}
    </Section>
  )
}

function JoinByCode() {
  const { palette } = usePunchTheme()
  const router = useRouter()
  const [code, setCode] = useState('')
  const normalized = code.trim().toUpperCase()
  const valid = isValidPactId(normalized)

  return (
    <Section title="Have a code?">
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TextInput
          accessibilityLabel="Pact code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          onChangeText={setCode}
          onSubmitEditing={() => valid && router.push(`/pact/${normalized}`)}
          placeholder="DAWN"
          placeholderTextColor={palette.dim}
          style={{
            backgroundColor: palette.inset,
            borderColor: palette.line,
            borderWidth: 1,
            color: palette.text,
            flex: 1,
            fontFamily: 'JetBrainsMono_800ExtraBold',
            fontSize: 20,
            letterSpacing: 3,
            minHeight: 52,
            paddingHorizontal: 12,
          }}
          value={code}
        />
        <KeyButton disabled={!valid} onPress={() => router.push(`/pact/${normalized}`)}>
          Open
        </KeyButton>
      </View>
      {code && !valid ? <Notice message="Codes are 3–12 letters, digits or dashes." /> : null}
    </Section>
  )
}
