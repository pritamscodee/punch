import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Polygon } from 'react-native-svg'

import { formatCountdown, Label, Mono } from './kit'
import { usePunchTheme } from './tokens'

const PITCH = 10
const HEIGHT = 56

function Stripes({ width }: { width: number }) {
  const { palette } = usePunchTheme()
  const span = width + HEIGHT + PITCH * 4
  const polygons = []
  for (let x = -HEIGHT; x < span; x += PITCH * 2) {
    polygons.push(
      <Polygon
        fill={palette.enamelInk}
        key={x}
        points={`${x},${HEIGHT} ${x + PITCH},${HEIGHT} ${x + PITCH + HEIGHT},0 ${x + HEIGHT},0`}
      />,
    )
  }
  return (
    <Svg height={HEIGHT} width={span}>
      {polygons}
    </Svg>
  )
}

/**
 * Today's state. Unpaid: a 45° hazard band that keeps crawling until the shift is paid, with the
 * time left on a black plate. Paid: a flat enamel plate.
 */
export function ShiftBand({ closesIn, paidAt, penalty }: { closesIn: number; paidAt: string | null; penalty: string }) {
  const { palette } = usePunchTheme()
  const reduceMotion = useReducedMotion()
  const [width, setWidth] = useState(0)
  const offset = useSharedValue(0)

  useEffect(() => {
    if (paidAt || reduceMotion) {
      return
    }
    offset.value = 0
    offset.value = withRepeat(withTiming(-PITCH * 2, { duration: 900, easing: Easing.linear }), -1, false)
  }, [offset, paidAt, reduceMotion])
  const crawl = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }))

  if (paidAt) {
    return (
      <Animated.View
        entering={FadeIn.duration(250)}
        style={{
          alignItems: 'center',
          backgroundColor: palette.enamel,
          flexDirection: 'row',
          height: HEIGHT,
          justifyContent: 'space-between',
          paddingHorizontal: 16,
        }}
      >
        <Label size={17} tone="ink">
          Shift paid
        </Label>
        <View style={{ alignItems: 'flex-end' }}>
          <Mono bold size={15} tone="ink">
            {paidAt}
          </Mono>
          <Label size={10} tone="ink">
            Next shift {formatCountdown(closesIn)}
          </Label>
        </View>
      </Animated.View>
    )
  }

  const urgent = closesIn < 3600
  return (
    <Animated.View
      accessibilityLabel={`Shift unpaid. Closes in ${formatCountdown(closesIn)}. ${penalty} at risk.`}
      accessible
      exiting={FadeOut.duration(200)}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ backgroundColor: palette.enamel, height: HEIGHT, overflow: 'hidden' }}
    >
      {width > 0 ? (
        <Animated.View style={[{ left: 0, position: 'absolute', top: 0 }, crawl]}>
          <Stripes width={width} />
        </Animated.View>
      ) : null}
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <View
          style={{
            alignItems: 'center',
            backgroundColor: palette.enamelInk,
            flexDirection: 'row',
            gap: 12,
            paddingHorizontal: 14,
            paddingVertical: 7,
          }}
        >
          <Label size={14} style={{ color: urgent ? '#FF6B4A' : '#FFC400' }}>
            Unpaid
          </Label>
          <Mono bold size={17} style={{ color: '#ECEBE6' }}>
            {formatCountdown(closesIn)}
          </Mono>
          <Label size={11} style={{ color: '#8D929B' }}>
            {penalty} at risk
          </Label>
        </View>
      </View>
    </Animated.View>
  )
}
