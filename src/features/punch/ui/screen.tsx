import Ionicons from '@expo/vector-icons/Ionicons'
import { getExplorerUrl, useMobileWallet } from '@wallet-ui/react-native-kit'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import type { PropsWithChildren, ReactNode } from 'react'
import { Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'

import { ellipsify, Label, Mono } from './kit'
import { usePunchTheme } from './tokens'

export function useExplorer() {
  const { cluster } = useAppCluster()
  return (path: `/address/${string}` | `/tx/${string}`) =>
    void Linking.openURL(getExplorerUrl({ network: { id: cluster.id, url: cluster.url }, path, provider: 'solana' }))
}

/**
 * The top strip on every tab: the mark on the left, the wallet serial and cluster on an engraved
 * plate on the right, and the way into Settings.
 */
export function HeaderPlate({ title }: { title?: string }) {
  const { palette } = usePunchTheme()
  const { account } = useMobileWallet()
  const { cluster } = useAppCluster()
  const router = useRouter()

  return (
    <View
      style={{
        alignItems: 'center',
        borderBottomColor: palette.line,
        borderBottomWidth: 1,
        flexDirection: 'row',
        gap: 10,
        minHeight: 56,
      }}
    >
      <View style={{ alignItems: 'baseline', flex: 1, flexDirection: 'row', gap: 10 }}>
        <Label size={24} style={{ letterSpacing: 4 }} tone="text">
          Punch
        </Label>
        {title ? (
          <Label numberOfLines={1} size={14}>
            / {title}
          </Label>
        ) : null}
      </View>
      <View
        style={{
          backgroundColor: palette.inset,
          borderBottomColor: palette.highlight,
          borderColor: palette.line,
          borderTopColor: palette.shade,
          borderWidth: 1,
          flexDirection: 'row',
        }}
      >
        <View
          style={{
            borderRightColor: palette.line,
            borderRightWidth: 1,
            justifyContent: 'center',
            paddingHorizontal: 8,
          }}
        >
          <Label size={11} tone={cluster.id === 'solana:mainnet' ? 'enamel' : 'muted'}>
            {cluster.label}
          </Label>
        </View>
        <View style={{ justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 6 }}>
          <Mono size={12} tone={account ? 'text' : 'dim'}>
            {account ? ellipsify(account.address.toString()) : 'NO CARD'}
          </Mono>
        </View>
      </View>
      <Pressable
        accessibilityLabel="Settings"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => router.push('/settings')}
        style={{ alignItems: 'center', height: 44, justifyContent: 'center', width: 36 }}
      >
        <Ionicons color={palette.muted} name="settings-sharp" size={20} />
      </Pressable>
    </View>
  )
}

export function Screen({
  children,
  header,
  onRefresh,
  refreshing = false,
  title,
}: PropsWithChildren<{ header?: ReactNode; onRefresh?: () => void; refreshing?: boolean; title?: string }>) {
  const { palette } = usePunchTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ backgroundColor: palette.ground, flex: 1, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16 }}>{header ?? <HeaderPlate title={title} />}</View>
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingBottom: 32, paddingHorizontal: 16, paddingTop: 16 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              colors={[palette.enamelInk]}
              onRefresh={onRefresh}
              progressBackgroundColor={palette.enamel}
              refreshing={refreshing}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </View>
  )
}
