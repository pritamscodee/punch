import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg'

import { Label, Mono } from './kit'
import { fonts, usePunchTheme } from './tokens'

const START = 150
const SWEEP = 240

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from)
  const b = polar(cx, cy, r, to)
  const large = to - from > 180 ? 1 : 0
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`
}

/** Full scale grows in whole weeks so the needle always has headroom. */
export function gaugeScale(value: number) {
  return Math.max(7, Math.ceil((value + 1) / 7) * 7)
}

/**
 * Load gauge. The run is a machine reading: the needle sweeps up from zero on mount and whenever
 * the run changes.
 */
export function Gauge({ best, size, unit, value }: { best: number; size: number; unit: string; value: number }) {
  const { palette } = usePunchTheme()
  const scale = gaugeScale(Math.max(value, best))
  const r = size / 2 - 18
  const cx = size / 2
  const cy = size / 2
  const readoutTop = cy + 16
  const height = readoutTop + Math.round(size * 0.3) + 24
  const fraction = Math.min(value, scale) / scale
  const step = scale / 7

  const rotation = useSharedValue(0)
  useEffect(() => {
    rotation.value = 0
    rotation.value = withDelay(150, withSpring(SWEEP * fraction, { damping: 11, mass: 0.9, stiffness: 70 }))
  }, [fraction, rotation])
  const needleStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }))

  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })
  }, [progress])
  const fadeIn = useAnimatedStyle(() => ({ opacity: progress.value }))

  const ticks = []
  for (let i = 0; i <= 28; i++) {
    const major = i % 4 === 0
    const deg = START + (SWEEP * i) / 28
    const outer = polar(cx, cy, r, deg)
    const inner = polar(cx, cy, r - (major ? 16 : 8), deg)
    const lit = i / 28 <= fraction && value > 0
    ticks.push(
      <Line
        key={`t${i}`}
        stroke={lit ? palette.enamel : major ? palette.muted : palette.dim}
        strokeWidth={major ? 3 : 1.5}
        x1={outer.x}
        x2={inner.x}
        y1={outer.y}
        y2={inner.y}
      />,
    )
    if (major) {
      const at = polar(cx, cy, r - 30, deg)
      ticks.push(
        <SvgText
          fill={palette.muted}
          fontFamily={fonts.mono}
          fontSize={11}
          key={`l${i}`}
          textAnchor="middle"
          x={at.x}
          y={at.y + 4}
        >
          {Math.round((i / 4) * step)}
        </SvgText>,
      )
    }
  }

  const needleLength = r * 0.56
  const tip = polar(size / 2, size / 2, needleLength, START)
  const tail = polar(size / 2, size / 2, 14, START + 180)

  return (
    <View
      accessibilityLabel={`Run: ${value} ${unit.toLowerCase()}. Best ${best}.`}
      accessible
      style={{ alignSelf: 'center', height, width: size }}
    >
      <Animated.View style={[{ height: size, left: 0, position: 'absolute', top: 0, width: size }, fadeIn]}>
        <Svg height={size} width={size}>
          <Path d={arc(cx, cy, r + 6, START, START + SWEEP)} fill="none" stroke={palette.line} strokeWidth={1} />
          {fraction > 0 ? (
            <Path
              d={arc(cx, cy, r + 6, START, START + SWEEP * Math.max(fraction, 0.004))}
              fill="none"
              stroke={palette.enamel}
              strokeWidth={4}
            />
          ) : null}
          {ticks}
        </Svg>
      </Animated.View>

      <View style={{ alignItems: 'center', left: 0, position: 'absolute', right: 0, top: readoutTop }}>
        <Mono bold size={Math.round(size * 0.27)} style={{ lineHeight: Math.round(size * 0.3) }}>
          {value}
        </Mono>
        <Label size={13} style={{ marginTop: -2 }}>
          {unit}
        </Label>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[{ height: size, left: 0, position: 'absolute', top: 0, width: size }, needleStyle]}
      >
        <Svg height={size} width={size}>
          <Line
            stroke={palette.enamel}
            strokeLinecap="square"
            strokeWidth={4}
            x1={tail.x}
            x2={tip.x}
            y1={tail.y}
            y2={tip.y}
          />
          <Circle cx={size / 2} cy={size / 2} fill={palette.enamel} r={9} />
          <Circle cx={size / 2} cy={size / 2} fill={palette.ground} r={3.5} />
        </Svg>
      </Animated.View>
    </View>
  )
}
