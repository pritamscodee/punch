import { useUniwind } from 'uniwind'

/**
 * TIME CLOCK palette. Enamel yellow carries live state only (the punch key, the needle, the unpaid
 * band) and is never a page background. Panels are square, bordered plates, not shadowed cards.
 */
const dark = {
  danger: '#FF6B4A',
  enamel: '#FFC400',
  enamelInk: '#14161A',
  enamelPressed: '#D9A700',
  /** Enamel used as text colour: the yellow itself on dark, a dark amber that holds contrast on light. */
  enamelText: '#FFC400',
  ground: '#14161A',
  hairline: '#262A30',
  highlight: '#2E333B',
  inset: '#0E1013',
  line: '#33383F',
  muted: '#8D929B',
  dim: '#5A5F68',
  panel: '#1B1E23',
  shade: '#08090B',
  text: '#ECEBE6',
}

const light: typeof dark = {
  danger: '#C2391B',
  enamel: '#FFC400',
  enamelInk: '#14161A',
  enamelPressed: '#E0AC00',
  enamelText: '#8A5A00',
  ground: '#F2F2EF',
  hairline: '#D9D9D3',
  highlight: '#FFFFFF',
  inset: '#E4E4DF',
  line: '#BDBDB5',
  muted: '#5C616A',
  dim: '#93979E',
  panel: '#EAEAE5',
  shade: '#C4C4BC',
  text: '#16181B',
}

export type PunchPalette = typeof dark

export const fonts = {
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_800ExtraBold',
  stencil: 'BigShouldersStencil_800ExtraBold',
  stencilBold: 'BigShouldersStencil_900Black',
} as const

export function usePunchTheme() {
  const { theme } = useUniwind()
  const isDark = theme !== 'light'
  return { fonts, isDark, palette: isDark ? dark : light }
}
