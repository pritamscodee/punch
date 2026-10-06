import { ActivityIndicator, Pressable, View } from 'react-native'
import Animated, { ZoomIn } from 'react-native-reanimated'
import Ionicons from '@expo/vector-icons/Ionicons'

import { Label, Mono } from './kit'
import { usePunchTheme } from './tokens'

export type PunchKeyState = { kind: 'ready' } | { kind: 'busy'; label: string } | { kind: 'paid'; at: string }

/**
 * The one action. Full width, square, enamel; it travels down like a keycap. Once the shift is
 * paid the key is replaced by a stamped plate so it cannot be pressed twice.
 */
export function PunchKey({ onPress, state }: { onPress(): void; state: PunchKeyState }) {
  const { palette } = usePunchTheme()

  if (state.kind === 'paid') {
    return (
      <Animated.View
        entering={ZoomIn.springify().damping(12)}
        style={{
          alignItems: 'center',
          borderColor: palette.enamelText,
          borderStyle: 'dashed',
          borderWidth: 2,
          flexDirection: 'row',
          gap: 12,
          height: 72,
          justifyContent: 'center',
        }}
      >
        <Ionicons color={palette.enamelText} name="checkmark-done" size={26} />
        <Label size={22} tone="enamel">
          Punched
        </Label>
        <Mono bold size={18} tone="enamel">
          {state.at}
        </Mono>
      </Animated.View>
    )
  }

  const busy = state.kind === 'busy'
  return (
    <Pressable
      accessibilityHint="Signs a punch-in record with your wallet."
      accessibilityLabel="Punch in"
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
    >
      {({ pressed }) => {
        const down = pressed || busy
        return (
          <View style={{ height: 78, justifyContent: 'flex-end' }}>
            <View
              style={{
                alignItems: 'center',
                backgroundColor: down ? palette.enamelPressed : palette.enamel,
                borderBottomColor: '#8A6A00',
                borderBottomWidth: down ? 2 : 7,
                flexDirection: 'row',
                gap: 12,
                height: down ? 73 : 78,
                justifyContent: 'center',
              }}
            >
              {busy ? (
                <>
                  <ActivityIndicator color={palette.enamelInk} />
                  <Label size={20} tone="ink">
                    {state.label}
                  </Label>
                </>
              ) : (
                <Label size={30} style={{ letterSpacing: 6 }} tone="ink">
                  Punch in
                </Label>
              )}
            </View>
          </View>
        )
      }}
    </Pressable>
  )
}
