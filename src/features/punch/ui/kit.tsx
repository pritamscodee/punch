import type { PropsWithChildren, ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, type TextProps, View, type ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'

import { fonts, usePunchTheme } from './tokens'

type Tone = 'text' | 'muted' | 'dim' | 'enamel' | 'danger' | 'ink'

function useTone(tone: Tone) {
  const { palette } = usePunchTheme()
  return tone === 'ink' ? palette.enamelInk : tone === 'enamel' ? palette.enamelText : palette[tone]
}

/** Stencil condensed uppercase label with wide tracking. */
export function Label({
  children,
  size = 13,
  style,
  tone = 'muted',
  ...props
}: TextProps & { size?: number; tone?: Tone }) {
  const color = useTone(tone)
  return (
    <Text
      {...props}
      style={[
        { color, fontFamily: fonts.stencil, fontSize: size, letterSpacing: size * 0.16, textTransform: 'uppercase' },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

/** Stencil display heading. */
export function Heading({
  children,
  size = 30,
  style,
  tone = 'text',
  ...props
}: TextProps & { size?: number; tone?: Tone }) {
  const color = useTone(tone)
  return (
    <Text
      {...props}
      style={[
        {
          color,
          fontFamily: fonts.stencilBold,
          fontSize: size,
          letterSpacing: size * 0.04,
          lineHeight: size * 1.05,
          textTransform: 'uppercase',
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

/** Tabular mono figures. Every number in PUNCH is set in this face. */
export function Mono({
  bold,
  children,
  size = 14,
  style,
  tone = 'text',
  ...props
}: TextProps & { bold?: boolean; size?: number; tone?: Tone }) {
  const color = useTone(tone)
  return (
    <Text
      {...props}
      style={[
        { color, fontFamily: bold ? fonts.monoBold : fonts.mono, fontSize: size, fontVariant: ['tabular-nums'] },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

/** Body copy: plain system face, terse. */
export function Body({ children, style, tone = 'muted', ...props }: TextProps & { tone?: Tone }) {
  const color = useTone(tone)
  return (
    <Text {...props} style={[{ color, fontSize: 15, lineHeight: 22 }, style]}>
      {children}
    </Text>
  )
}

/**
 * Engraved plate: an inset panel with a 1px top highlight and a 1px bottom shade, square corners.
 */
export function Plate({ children, inset, style }: PropsWithChildren<{ inset?: boolean; style?: ViewStyle }>) {
  const { palette } = usePunchTheme()
  return (
    <View
      style={[
        {
          backgroundColor: inset ? palette.inset : palette.panel,
          borderBottomColor: inset ? palette.highlight : palette.shade,
          borderColor: palette.line,
          borderTopColor: inset ? palette.shade : palette.highlight,
          borderWidth: 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

/** Plate with a stencil caption bar, used for every grouped section. */
export function Section({ action, children, title }: PropsWithChildren<{ action?: ReactNode; title: string }>) {
  const { palette } = usePunchTheme()
  return (
    <Plate>
      <View
        style={{
          alignItems: 'center',
          borderBottomColor: palette.hairline,
          borderBottomWidth: 1,
          flexDirection: 'row',
          justifyContent: 'space-between',
          minHeight: 40,
          paddingHorizontal: 14,
        }}
      >
        <Label size={12}>{title}</Label>
        {action}
      </View>
      <View style={{ padding: 14 }}>{children}</View>
    </Plate>
  )
}

/** Label / value spec line, as on a machine load plate. */
export function SpecRow({
  label,
  last,
  tone = 'text',
  value,
}: {
  label: string
  last?: boolean
  tone?: Tone
  value: ReactNode
}) {
  const { palette } = usePunchTheme()
  return (
    <View
      style={{
        alignItems: 'center',
        borderBottomColor: palette.hairline,
        borderBottomWidth: last ? 0 : 1,
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'space-between',
        minHeight: 40,
      }}
    >
      <Label size={12}>{label}</Label>
      {typeof value === 'string' ? (
        <Mono numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }} tone={tone}>
          {value}
        </Mono>
      ) : (
        value
      )}
    </View>
  )
}

/** Three figures side by side, separated by hairlines. */
export function FigureStrip({ items }: { items: { label: string; tone?: Tone; value: string }[] }) {
  const { palette } = usePunchTheme()
  return (
    <Plate style={{ flexDirection: 'row' }}>
      {items.map((item, index) => (
        <View
          key={item.label}
          style={{
            borderLeftColor: palette.hairline,
            borderLeftWidth: index === 0 ? 0 : 1,
            flex: 1,
            gap: 4,
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        >
          <Mono bold numberOfLines={1} adjustsFontSizeToFit size={22} tone={item.tone ?? 'text'}>
            {item.value}
          </Mono>
          <Label size={11}>{item.label}</Label>
        </View>
      ))}
    </Plate>
  )
}

/**
 * Secondary control: square, bordered steel key. The enamel variant is reserved for the one live
 * action on a screen.
 */
export function KeyButton({
  children,
  disabled,
  icon,
  loading,
  onPress,
  variant = 'steel',
}: {
  children: string
  disabled?: boolean
  icon?: ReactNode
  loading?: boolean
  onPress(): void
  variant?: 'enamel' | 'steel' | 'ghost'
}) {
  const { palette } = usePunchTheme()
  const isEnamel = variant === 'enamel'
  const inactive = disabled || loading
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: inactive }}
      disabled={inactive}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: isEnamel
          ? pressed
            ? palette.enamelPressed
            : palette.enamel
          : variant === 'ghost'
            ? 'transparent'
            : pressed
              ? palette.inset
              : palette.panel,
        borderBottomWidth: pressed || variant === 'ghost' ? 1 : 3,
        borderColor: isEnamel ? palette.enamelPressed : palette.line,
        borderWidth: variant === 'ghost' ? 0 : 1,
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'center',
        minHeight: 52,
        opacity: inactive ? 0.5 : 1,
        paddingHorizontal: 18,
        transform: [{ translateY: pressed && variant !== 'ghost' ? 2 : 0 }],
      })}
    >
      {loading ? <ActivityIndicator color={isEnamel ? palette.enamelInk : palette.text} /> : icon}
      <Label size={15} tone={isEnamel ? 'ink' : 'text'}>
        {children}
      </Label>
    </Pressable>
  )
}

/** Inline status line for the result of an action. */
export function Notice({ message, tone = 'muted' }: { message: string; tone?: 'muted' | 'danger' | 'enamel' }) {
  const { palette } = usePunchTheme()
  return (
    <View
      style={{
        borderLeftColor: tone === 'danger' ? palette.danger : tone === 'enamel' ? palette.enamel : palette.line,
        borderLeftWidth: 3,
        paddingLeft: 10,
        paddingVertical: 4,
      }}
    >
      <Body tone={tone === 'danger' ? 'danger' : 'text'}>{message}</Body>
    </View>
  )
}

export function ellipsify(value: string, length = 4) {
  return value.length > length * 2 + 1 ? `${value.slice(0, length)}…${value.slice(-length)}` : value
}

export function formatCountdown(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

export function formatPeriod(seconds: number) {
  if (seconds % 86_400 === 0) {
    return seconds === 86_400 ? '24 H' : `${seconds / 86_400} D`
  }
  if (seconds % 3600 === 0) {
    return `${seconds / 3600} H`
  }
  return `${Math.round(seconds / 60)} MIN`
}
