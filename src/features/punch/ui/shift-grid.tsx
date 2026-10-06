import { View } from 'react-native'
import Svg, { Line, Rect } from 'react-native-svg'

import type { DayState } from '@/features/punch/protocol/ledger'
import type { PactDef } from '@/features/punch/protocol/records'
import { dayStart } from '@/features/punch/protocol/records'

import { Label, Mono } from './kit'
import { usePunchTheme } from './tokens'

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function caption(def: PactDef, day: number) {
  if (def.period === 86_400) {
    return WEEKDAYS[new Date(dayStart(def, day) * 1000).getUTCDay()]
  }
  return `#${day % 1000}`
}

function Mark({ state }: { state: DayState }) {
  const { palette } = usePunchTheme()
  switch (state) {
    case 'paid':
      return (
        <Svg height={22} width={22}>
          <Rect fill={palette.enamel} height={22} width={22} />
          <Rect fill={palette.enamelInk} height={4} width={10} x={6} y={9} />
        </Svg>
      )
    case 'missed':
      return (
        <Svg height={22} width={22}>
          <Line stroke={palette.danger} strokeWidth={3} x1={3} x2={19} y1={3} y2={19} />
          <Line stroke={palette.danger} strokeWidth={3} x1={19} x2={3} y1={3} y2={19} />
        </Svg>
      )
    case 'open':
      return (
        <Svg height={22} width={22}>
          <Rect
            fill="none"
            height={20}
            stroke={palette.enamel}
            strokeDasharray="4 3"
            strokeWidth={2}
            width={20}
            x={1}
            y={1}
          />
        </Svg>
      )
    default:
      return (
        <Svg height={22} width={22}>
          <Rect fill={palette.dim} height={4} width={4} x={9} y={9} />
        </Svg>
      )
  }
}

/** Seven shifts drawn on hairline construction lines: cells are structure, not cards. */
export function ShiftGrid({ def, recent }: { def: PactDef; recent: { day: number; state: DayState }[] }) {
  const { palette } = usePunchTheme()
  const week = recent.slice(-7)
  return (
    <View
      accessibilityLabel={`Last seven shifts: ${week.map((cell) => cell.state).join(', ')}`}
      accessible
      style={{ borderColor: palette.line, borderWidth: 1, flexDirection: 'row' }}
    >
      {week.map((cell, index) => {
        const today = index === week.length - 1
        return (
          <View
            key={cell.day}
            style={{
              alignItems: 'center',
              borderLeftColor: palette.hairline,
              borderLeftWidth: index === 0 ? 0 : 1,
              borderTopColor: today ? palette.enamel : 'transparent',
              borderTopWidth: 3,
              flex: 1,
              gap: 8,
              paddingBottom: 12,
              paddingTop: 9,
            }}
          >
            <Label size={11} tone={today ? 'text' : 'muted'}>
              {caption(def, cell.day)}
            </Label>
            <Mark state={cell.state} />
          </View>
        )
      })}
    </View>
  )
}

/** The run as a barcode column of notches, 28 shifts, oldest left. */
export function ShiftBarcode({ recent }: { recent: { day: number; state: DayState }[] }) {
  const { palette } = usePunchTheme()
  const paid = recent.filter((cell) => cell.state === 'paid').length
  return (
    <View style={{ gap: 10 }}>
      <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 3, height: 54 }}>
        {recent.map((cell) => (
          <View
            key={cell.day}
            style={{
              backgroundColor:
                cell.state === 'paid'
                  ? palette.enamel
                  : cell.state === 'missed'
                    ? palette.danger
                    : cell.state === 'open'
                      ? palette.muted
                      : palette.hairline,
              flex: 1,
              height: cell.state === 'paid' ? 54 : cell.state === 'missed' ? 18 : cell.state === 'open' ? 30 : 8,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Label size={11}>28 shifts ago</Label>
        <Mono size={12} tone="muted">
          {paid}/28 paid
        </Mono>
        <Label size={11}>Now</Label>
      </View>
    </View>
  )
}
