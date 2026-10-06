import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { useToast } from 'heroui-native/toast'
import { useState } from 'react'
import { View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'

import { Body, Heading, KeyButton, Label, Mono, Plate } from '@/features/punch/ui/kit'
import { usePunchTheme } from '@/features/punch/ui/tokens'
import { formatError } from '@/features/wallet/util/format-error'

const RULES = [
  ['Bond', 'Approve a bond in SKR. It stays in your wallet; the settler can take one penalty per missed shift.'],
  ['Punch', 'Once per shift, one tap. Your wallet signs a record onto Solana. That is the whole habit.'],
  ['Pay out', 'Miss a shift and your penalty is split between everyone who punched in. No treasury, no house cut.'],
] as const

export function PunchFeatureOnboarding() {
  const { connect } = useMobileWallet()
  const { palette } = usePunchTheme()
  const { toast } = useToast()
  const [connecting, setConnecting] = useState(false)

  async function handleConnect() {
    setConnecting(true)
    try {
      await connect()
    } catch (error) {
      const message = formatError(error)
      toast.show({
        description: /cancel/i.test(message) ? 'The wallet request was dismissed.' : message,
        label: 'Wallet not connected',
        placement: 'bottom',
        variant: 'warning',
      })
    } finally {
      setConnecting(false)
    }
  }

  return (
    <View style={{ gap: 20 }}>
      <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 10, paddingTop: 12 }}>
        <Heading size={58}>Clock in.</Heading>
        <Heading size={58} tone="enamel">
          Or pay the ones who did.
        </Heading>
        <Body style={{ marginTop: 6 }}>
          PUNCH is a time clock for a habit. Your streak is bonded in SKR and every punch is a Solana transaction you
          can open.
        </Body>
      </Animated.View>

      <Plate>
        {RULES.map(([title, text], index) => (
          <Animated.View
            entering={FadeInDown.delay(120 + index * 90).duration(350)}
            key={title}
            style={{
              borderTopColor: palette.hairline,
              borderTopWidth: index === 0 ? 0 : 1,
              flexDirection: 'row',
              gap: 14,
              padding: 14,
            }}
          >
            <Mono bold size={20} tone="enamel">
              {`0${index + 1}`}
            </Mono>
            <View style={{ flex: 1, gap: 4 }}>
              <Label size={15} tone="text">
                {title}
              </Label>
              <Body>{text}</Body>
            </View>
          </Animated.View>
        ))}
      </Plate>

      <KeyButton loading={connecting} onPress={() => void handleConnect()} variant="enamel">
        Connect wallet
      </KeyButton>
      <Body style={{ fontSize: 13, textAlign: 'center' }}>
        Connects through Mobile Wallet Adapter: Seed Vault on Seeker, or any Solana wallet on Android.
      </Body>
    </View>
  )
}
