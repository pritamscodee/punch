import { Stack } from 'expo-router/stack'

import { fonts, usePunchTheme } from '@/features/punch/ui/tokens'

export default function SettingsLayout() {
  const { palette } = usePunchTheme()

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: palette.ground },
        gestureEnabled: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: palette.ground },
        headerTintColor: palette.text,
        headerTitleStyle: { color: palette.text, fontFamily: fonts.stencil },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="cluster" options={{ title: 'CLUSTER' }} />
    </Stack>
  )
}
