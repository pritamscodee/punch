import type { Address } from '@solana/kit'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'
import { useBondAccount } from '@/features/punch/data-access/use-pact'
import { useCreatePact } from '@/features/punch/data-access/use-punch-actions'
import { BOND_ASSETS, KEEPER_ADDRESS } from '@/features/punch/protocol/constants'
import { isValidPactId, type PactDef, sanitizePactName } from '@/features/punch/protocol/records'
import { PunchFeatureOnboarding } from '@/features/punch/punch-feature-onboarding'
import { formatAmount } from '@/features/punch/punch-format'
import { Body, KeyButton, Label, Mono, Notice, Section, SpecRow } from '@/features/punch/ui/kit'
import { Screen } from '@/features/punch/ui/screen'
import { fonts, usePunchTheme } from '@/features/punch/ui/tokens'
import { formatError } from '@/features/wallet/util/format-error'

const SHIFTS = [
  { label: '24 H', period: 86_400 },
  { label: '1 H', period: 3_600 },
  { label: '5 MIN', period: 300 },
]
const PENALTIES = [1, 5, 10, 25]
const COVERS = [5, 10, 20]

function Segmented<T extends number>({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange(value: T): void
  options: { label: string; value: T }[]
  value: T
}) {
  const { palette } = usePunchTheme()
  return (
    <View style={{ gap: 8 }}>
      <Label size={12}>{label}</Label>
      <View style={{ borderColor: palette.line, borderWidth: 1, flexDirection: 'row' }}>
        {options.map((option, index) => {
          const selected = option.value === value
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={String(option.value)}
              onPress={() => onChange(option.value)}
              style={{
                alignItems: 'center',
                backgroundColor: selected ? palette.enamel : palette.panel,
                borderLeftColor: palette.line,
                borderLeftWidth: index === 0 ? 0 : 1,
                flex: 1,
                justifyContent: 'center',
                minHeight: 48,
              }}
            >
              <Mono bold size={14} tone={selected ? 'ink' : 'text'}>
                {option.label}
              </Mono>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function codeFrom(name: string) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 12)
}

export function PunchFeatureNewPact() {
  const { account } = useMobileWallet()
  const { cluster } = useAppCluster()
  const { palette } = usePunchTheme()
  const router = useRouter()
  const assets = BOND_ASSETS.filter((asset) =>
    cluster.id === 'solana:mainnet' ? asset.cluster === 'mainnet' : asset.cluster === 'devnet',
  )
  const [assetIndex, setAssetIndex] = useState(0)
  const asset = assets[assetIndex] ?? assets[0]
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [period, setPeriod] = useState(86_400)
  const [penaltyUnits, setPenaltyUnits] = useState(5)
  const [covers, setCovers] = useState(10)
  const [error, setError] = useState<string | null>(null)

  const owner = account?.address as Address | undefined
  const bond = useBondAccount(owner, asset?.mint)
  const held = bond.data?.delegate === KEEPER_ADDRESS ? bond.data.delegatedAmount : 0n
  const create = useCreatePact(held)

  if (!account || !asset) {
    return (
      <Screen title="New pact">
        <PunchFeatureOnboarding />
      </Screen>
    )
  }

  const id = (code || codeFrom(name)).toUpperCase()
  const unit = 10n ** BigInt(asset.decimals)
  const penalty = BigInt(penaltyUnits) * unit
  const def: PactDef = {
    bond: penalty * BigInt(covers),
    decimals: asset.decimals,
    id,
    mint: asset.mint,
    name: sanitizePactName(name) || id,
    origin: 0,
    penalty,
    period,
    settler: KEEPER_ADDRESS,
  }
  const short = (bond.data?.amount ?? 0n) < held + def.bond
  const valid = isValidPactId(id) && sanitizePactName(name).length >= 2

  const inputStyle = {
    backgroundColor: palette.inset,
    borderColor: palette.line,
    borderWidth: 1,
    color: palette.text,
    fontSize: 18,
    minHeight: 52,
    paddingHorizontal: 12,
  }

  return (
    <Screen title="New pact">
      <Section title="Name the floor">
        <View style={{ gap: 12 }}>
          <TextInput
            accessibilityLabel="Pact name"
            maxLength={32}
            onChangeText={setName}
            placeholder="5AM Run Club"
            placeholderTextColor={palette.dim}
            style={[inputStyle, { fontFamily: fonts.stencil, letterSpacing: 1.5, textTransform: 'uppercase' }]}
            value={name}
          />
          <TextInput
            accessibilityLabel="Pact code"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            onChangeText={(text) => setCode(text.toUpperCase())}
            placeholder={codeFrom(name) || 'CODE'}
            placeholderTextColor={palette.dim}
            style={[inputStyle, { fontFamily: fonts.monoBold, letterSpacing: 3 }]}
            value={code}
          />
          <Body style={{ fontSize: 13 }}>The code is how people join. First come, first served on chain.</Body>
        </View>
      </Section>

      <Section title="Rules">
        <View style={{ gap: 16 }}>
          {assets.length > 1 ? (
            <Segmented
              label="Bond asset"
              onChange={setAssetIndex}
              options={assets.map((item, index) => ({ label: item.symbol, value: index }))}
              value={assetIndex}
            />
          ) : null}
          <Segmented
            label="Shift length"
            onChange={setPeriod}
            options={SHIFTS.map((shift) => ({ label: shift.label, value: shift.period }))}
            value={period}
          />
          <Segmented
            label={`Penalty per missed shift (${asset.symbol})`}
            onChange={setPenaltyUnits}
            options={PENALTIES.map((value) => ({ label: String(value), value }))}
            value={penaltyUnits}
          />
          <Segmented
            label="Bond covers"
            onChange={setCovers}
            options={COVERS.map((value) => ({ label: `${value} MISSES`, value }))}
            value={covers}
          />
        </View>
      </Section>

      <Section title="Load plate">
        <SpecRow label="Code" tone="enamel" value={id || '—'} />
        <SpecRow label="Your bond" value={formatAmount(def, def.bond)} />
        <SpecRow label="Per miss" value={formatAmount(def, def.penalty)} />
        <SpecRow label="Settler" last value="PUNCH keeper" />
      </Section>

      {short ? (
        <Notice
          message={`You need ${formatAmount(def, def.bond)} in your wallet to open this pact. ${asset.cluster === 'devnet' ? 'Get test tSKR from any pact page or Settings.' : ''}`}
          tone="danger"
        />
      ) : null}
      {error ? <Notice message={error} tone="danger" /> : null}
      <KeyButton
        disabled={!valid || short}
        loading={create.isPending}
        onPress={() => {
          setError(null)
          const now = Math.floor(Date.now() / 1000)
          // Daily pacts close at 00:00 UTC; shorter shifts start on the current boundary.
          create.mutate(
            { ...def, origin: period === 86_400 ? 0 : now - (now % period) },
            {
              onError: (e) => setError(formatError(e)),
              onSuccess: () => router.replace('/floor'),
            },
          )
        }}
        variant="enamel"
      >
        Open pact & bond
      </KeyButton>
      <Body style={{ fontSize: 12, textAlign: 'center' }}>
        One signature: defines the pact on Solana, registers it, approves your bond and clocks you on.
      </Body>
    </Screen>
  )
}
