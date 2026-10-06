import '../global.css'

import {
  BigShouldersStencil_800ExtraBold,
  BigShouldersStencil_900Black,
} from '@expo-google-fonts/big-shoulders-stencil'
import { JetBrainsMono_500Medium, JetBrainsMono_800ExtraBold, useFonts } from '@expo-google-fonts/jetbrains-mono'
import * as SplashScreen from 'expo-splash-screen'
import { Stack } from 'expo-router/stack'
import { useEffect } from 'react'

import { AppProviders } from '@/features/core/data-access/app-providers'
import { usePunchTheme } from '@/features/punch/ui/tokens'

void SplashScreen.preventAutoHideAsync()

export default function Layout() {
  const [loaded, error] = useFonts({
    BigShouldersStencil_800ExtraBold,
    BigShouldersStencil_900Black,
    JetBrainsMono_500Medium,
    JetBrainsMono_800ExtraBold,
  })

  useEffect(() => {
    if (loaded || error) {
      void SplashScreen.hideAsync()
    }
  }, [loaded, error])

  if (!loaded && !error) {
    return null
  }

  return (
    <AppProviders>
      <RootStack />
    </AppProviders>
  )
}

function RootStack() {
  const { palette } = usePunchTheme()
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: palette.ground }, headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="pact/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="pact/new" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
    </Stack>
  )
}
