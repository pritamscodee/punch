import * as SystemUI from 'expo-system-ui'
import { useEffect } from 'react'
import { Uniwind, useUniwind } from 'uniwind'

export type Theme = 'dark' | 'light' | 'system'
export type ThemeOption = { label: string; name: Theme }

// Kept in step with the PUNCH palette in features/punch/ui/tokens.ts.
const ACTIVE_TINT = '#FFC400'
const BG_DARK = '#14161A'
const BG_LIGHT = '#F2F2EF'
const FG_DARK = '#ECEBE6'
const FG_LIGHT = '#16181B'
const MUTED_DARK = '#8D929B'
const MUTED_LIGHT = '#5C616A'

const themes: ThemeOption[] = [
  { label: 'Dark', name: 'dark' },
  { label: 'Light', name: 'light' },
  { label: 'System', name: 'system' },
]

export interface UseThemeResult {
  activeTheme: Theme
  backgroundColor: string
  foregroundColor: string
  iconColor: { default: string; selected: string }
  indicatorColor: string
  isDark: boolean
  isLight: boolean
  mutedColor: string
  navigationHeaderOptions: {
    headerShadowVisible: false
    headerStyle: { backgroundColor: string }
    headerTitleAlign: 'left'
    headerTintColor: string
    headerTitleStyle: { color: string }
  }
  theme: 'dark' | 'light'
  themes: ThemeOption[]
  tintColor: string
}

export function setTheme(theme: Theme) {
  Uniwind.setTheme(theme)
}

export function useTheme(): UseThemeResult {
  const { hasAdaptiveThemes, theme } = useUniwind()
  const isDark = theme === 'dark'
  const isLight = theme === 'light'
  const backgroundColor = isLight ? BG_LIGHT : BG_DARK
  const foregroundColor = isLight ? FG_LIGHT : FG_DARK
  const mutedColor = isLight ? MUTED_LIGHT : MUTED_DARK

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(backgroundColor).catch(() => undefined)
  }, [backgroundColor])

  return {
    activeTheme: hasAdaptiveThemes ? 'system' : theme,
    backgroundColor,
    foregroundColor,
    iconColor: { default: mutedColor, selected: ACTIVE_TINT },
    indicatorColor: isLight ? '#EAEAE5' : '#1B1E23',
    isDark,
    isLight,
    mutedColor,
    navigationHeaderOptions: {
      headerShadowVisible: false,
      headerStyle: { backgroundColor },
      headerTitleAlign: 'left',
      headerTintColor: ACTIVE_TINT,
      headerTitleStyle: { color: foregroundColor },
    },
    theme,
    themes,
    tintColor: ACTIVE_TINT,
  }
}
