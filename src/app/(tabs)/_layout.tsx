import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs } from 'expo-router/js-tabs'
import type { ComponentProps } from 'react'
import { type ColorValue, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fonts, usePunchTheme } from '@/features/punch/ui/tokens'

type IconName = ComponentProps<typeof Ionicons>['name']

function TabIcon({ color, focused, name }: { color: ColorValue; focused: boolean; name: IconName }) {
  const { palette } = usePunchTheme()
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={{ backgroundColor: focused ? palette.enamel : 'transparent', height: 3, width: 28 }} />
      <Ionicons color={color as string} name={name} size={22} />
    </View>
  )
}

export default function TabsLayout() {
  const { palette } = usePunchTheme()
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: palette.ground },
        tabBarActiveTintColor: palette.text,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: palette.dim,
        tabBarLabelStyle: { fontFamily: fonts.stencil, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
        tabBarStyle: {
          backgroundColor: palette.panel,
          borderTopColor: palette.line,
          height: 68 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} name="timer-outline" />,
          title: 'Clock',
        }}
      />
      <Tabs.Screen
        name="floor"
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} name="people-outline" />,
          title: 'Floor',
        }}
      />
      <Tabs.Screen
        name="ledger"
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} name="receipt-outline" />,
          title: 'Ledger',
        }}
      />
    </Tabs>
  )
}
