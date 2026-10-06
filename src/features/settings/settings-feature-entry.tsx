import Ionicons from '@expo/vector-icons/Ionicons'
import { useQuery } from '@tanstack/react-query'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Switch, TextInput, View } from 'react-native'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'
import { fetchKeeperHealth } from '@/features/punch/data-access/keeper-api'
import { updatePunchSettings, usePunchSettings } from '@/features/punch/data-access/punch-settings'
import { ensureReminderPermission } from '@/features/punch/data-access/reminders'
import { formatUnits } from '@/features/punch/data-access/use-pact'
import { useFaucet } from '@/features/punch/data-access/use-punch-actions'
import { BOND_ASSETS, KEEPER_ADDRESS } from '@/features/punch/protocol/constants'
import { Body, ellipsify, KeyButton, Label, Mono, Notice, Section, SpecRow } from '@/features/punch/ui/kit'
import { Screen, useExplorer } from '@/features/punch/ui/screen'
import { fonts, usePunchTheme } from '@/features/punch/ui/tokens'
import { ShellUiThemeSwitcher } from '@/features/shell/ui/shell-ui-theme-switcher'
import { useGetBalance } from '@/features/wallet/data-access/use-get-balance'
import { formatError } from '@/features/wallet/util/format-error'
import packageJson from '../../../package.json'

export function SettingsFeatureEntry() {
  const { account, disconnect } = useMobileWallet()
  const { cluster } = useAppCluster()
  const settings = usePunchSettings()
  const router = useRouter()
  const explorer = useExplorer()
  const { palette } = usePunchTheme()
  const faucet = useFaucet()
  const [status, setStatus] = useState<{ message: string; tone: 'danger' | 'enamel' } | null>(null)
  const [keeperDraft, setKeeperDraft] = useState(settings.keeperUrl)
  const health = useQuery({
    queryFn: () => fetchKeeperHealth(settings.keeperUrl),
    queryKey: ['keeper-health', settings.keeperUrl],
    retry: 0,
  })
  const devnetAsset = BOND_ASSETS.find((asset) => asset.cluster === 'devnet')!

  return (
    <Screen title="Settings">
      <Section title="Wallet">
        {account ? (
          <>
            <SpecRow label="Address" value={ellipsify(account.address.toString(), 6)} />
            <SolBalance address={account.address} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <KeyButton onPress={() => explorer(`/address/${account.address}`)}>Explorer</KeyButton>
              </View>
              <View style={{ flex: 1 }}>
                <KeyButton onPress={() => void disconnect()}>Disconnect</KeyButton>
              </View>
            </View>
          </>
        ) : (
          <Body>Not connected.</Body>
        )}
      </Section>

      {account && cluster.id === 'solana:devnet' ? (
        <Section title="Devnet test kit">
          <Body>
            {`100 ${devnetAsset.symbol} (the devnet stand-in for SKR) plus a little SOL for fees if your wallet is empty. Once every 10 minutes.`}
          </Body>
          <View style={{ gap: 10, marginTop: 12 }}>
            <KeyButton
              loading={faucet.isPending}
              onPress={() => {
                setStatus(null)
                faucet.mutate(undefined, {
                  onError: (e) => setStatus({ message: formatError(e), tone: 'danger' }),
                  onSuccess: (r) =>
                    setStatus({
                      message: `Received ${formatUnits(BigInt(r.tokens), devnetAsset.decimals)} ${devnetAsset.symbol}${r.lamports ? ' + 0.05 SOL' : ''}.`,
                      tone: 'enamel',
                    }),
                })
              }}
              variant="enamel"
            >
              Get test kit
            </KeyButton>
            {status ? <Notice message={status.message} tone={status.tone} /> : null}
          </View>
        </Section>
      ) : null}

      <Section title="Reminders">
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
          <Body style={{ flex: 1 }}>Notify me before a shift closes while it is unpaid.</Body>
          <Switch
            accessibilityLabel="Shift reminders"
            onValueChange={async (value) => {
              if (value && !(await ensureReminderPermission())) {
                setStatus({ message: 'Notifications are blocked for PUNCH in Android settings.', tone: 'danger' })
                return
              }
              updatePunchSettings({ remindersEnabled: value })
            }}
            thumbColor={settings.remindersEnabled ? palette.enamel : palette.muted}
            trackColor={{ false: palette.line, true: palette.enamelPressed }}
            value={settings.remindersEnabled}
          />
        </View>
      </Section>

      <Section
        action={
          <Mono size={12} tone={health.data?.ok ? 'enamel' : health.isLoading ? 'muted' : 'danger'}>
            {health.data?.ok
              ? `ONLINE · ${health.data.store.toUpperCase()}`
              : health.isLoading
                ? 'CHECKING'
                : 'OFFLINE'}
          </Mono>
        }
        title="Keeper"
      >
        <Body style={{ marginBottom: 10 }}>
          Settles closed shifts and runs the faucet. Punching works without it; payouts wait until it is back.
        </Body>
        <TextInput
          accessibilityLabel="Keeper URL"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={setKeeperDraft}
          style={{
            backgroundColor: palette.inset,
            borderColor: palette.line,
            borderWidth: 1,
            color: palette.text,
            fontFamily: fonts.mono,
            fontSize: 14,
            minHeight: 48,
            paddingHorizontal: 10,
          }}
          value={keeperDraft}
        />
        {keeperDraft.trim() !== settings.keeperUrl ? (
          <View style={{ marginTop: 10 }}>
            <KeyButton onPress={() => updatePunchSettings({ keeperUrl: keeperDraft.trim() })}>Save URL</KeyButton>
          </View>
        ) : null}
      </Section>

      <Section title="Cluster">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings/cluster')}
          style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 }}
        >
          <Label size={15} tone="text">
            {cluster.label}
          </Label>
          <Ionicons color={palette.muted} name="chevron-forward" size={18} />
        </Pressable>
      </Section>

      <Section title="Theme">
        <ShellUiThemeSwitcher />
      </Section>

      <Section title="Protocol">
        <Pressable accessibilityRole="link" onPress={() => explorer(`/address/${KEEPER_ADDRESS}`)}>
          <SpecRow label="Keeper" value={ellipsify(KEEPER_ADDRESS, 6)} />
        </Pressable>
        {BOND_ASSETS.map((asset, index) => (
          <SpecRow
            key={asset.mint}
            label={`${asset.symbol} · ${asset.cluster}`}
            last={index === BOND_ASSETS.length - 1}
            value={ellipsify(asset.mint, 6)}
          />
        ))}
      </Section>

      <Mono size={12} style={{ textAlign: 'center' }} tone="dim">
        {`${Constants.expoConfig?.name ?? 'PUNCH'} v${packageJson.version} · PUNCH1 protocol`}
      </Mono>
    </Screen>
  )
}

function SolBalance({ address }: { address: Parameters<typeof useGetBalance>[0] }) {
  const balance = useGetBalance(address)
  const value = balance.data?.value
  return (
    <SpecRow
      label="SOL"
      last
      value={value !== undefined ? formatUnits(value, 9, 4) : balance.isError ? 'Unavailable' : '…'}
    />
  )
}
