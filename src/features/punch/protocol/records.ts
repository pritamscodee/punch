import { PROTOCOL_PREFIX } from './constants'

/**
 * PUNCH v1 records. Mirrors `keeper/src/protocol.rs`; keep both in step.
 *
 *   PUNCH1|PACT|<id>|<name>|<mint>|<decimals>|<bond>|<penalty>|<period>|<origin>|<settler>
 *   PUNCH1|JOIN|<id>|<owner>
 *   PUNCH1|IN|<id>|<day>|<owner>
 *   PUNCH1|SETTLE|<id>|<day>|<slashed>|<paid>|<missed>|<punched>
 */

export type PactDef = {
  bond: bigint
  decimals: number
  id: string
  mint: string
  name: string
  /** Unix seconds of day 0's start. */
  origin: number
  penalty: bigint
  /** Shift length in seconds. */
  period: number
  settler: string
}

export type PunchRecord =
  | { kind: 'pact'; def: PactDef }
  | { kind: 'join'; owner: string; pact: string }
  | { day: number; kind: 'in'; owner: string; pact: string }
  | {
      day: number
      kind: 'settle'
      missed: number
      pact: string
      paid: bigint
      punched: number
      slashed: number
    }

export const PACT_ID_PATTERN = /^[A-Z0-9-]{3,12}$/

export function isValidPactId(id: string) {
  return PACT_ID_PATTERN.test(id)
}

/** Pact names are free text but cannot contain the record delimiters. */
export function sanitizePactName(name: string) {
  return name.replace(/[|;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 32)
}

function int(value: string | undefined) {
  if (value === undefined || !/^-?\d+$/.test(value)) {
    return undefined
  }
  return Number(value)
}

function big(value: string | undefined) {
  return value !== undefined && /^\d+$/.test(value) ? BigInt(value) : undefined
}

export function parseRecord(text: string): PunchRecord | null {
  const parts = text.trim().split('|')
  if (parts[0] !== PROTOCOL_PREFIX || parts.length < 3 || !isValidPactId(parts[2])) {
    return null
  }
  const pact = parts[2]

  switch (`${parts[1]}:${parts.length}`) {
    case 'PACT:11': {
      const [decimals, bond, penalty, period, origin] = [
        int(parts[5]),
        big(parts[6]),
        big(parts[7]),
        int(parts[8]),
        int(parts[9]),
      ]
      if (
        decimals === undefined ||
        bond === undefined ||
        penalty === undefined ||
        period === undefined ||
        period < 60 ||
        origin === undefined
      ) {
        return null
      }
      return {
        def: { bond, decimals, id: pact, mint: parts[4], name: parts[3], origin, penalty, period, settler: parts[10] },
        kind: 'pact',
      }
    }
    case 'JOIN:4':
      return { kind: 'join', owner: parts[3], pact }
    case 'IN:5': {
      const day = int(parts[3])
      return day === undefined ? null : { day, kind: 'in', owner: parts[4], pact }
    }
    case 'SETTLE:8': {
      const [day, slashed, paid, missed, punched] = [
        int(parts[3]),
        int(parts[4]),
        big(parts[5]),
        int(parts[6]),
        int(parts[7]),
      ]
      if (
        day === undefined ||
        slashed === undefined ||
        paid === undefined ||
        missed === undefined ||
        punched === undefined
      ) {
        return null
      }
      return { day, kind: 'settle', missed, pact, paid, punched, slashed }
    }
    default:
      return null
  }
}

/** The RPC formats memos on a signature as `[len] text`, joined by `; ` when there are several. */
export function parseMemoField(field: string | null | undefined): PunchRecord[] {
  if (!field) {
    return []
  }
  return field
    .split('; ')
    .map((part) => parseRecord(part.trim().replace(/^\[\d+\]\s/, '')))
    .filter((record): record is PunchRecord => record !== null)
}

export function encodePact(def: PactDef) {
  return [
    PROTOCOL_PREFIX,
    'PACT',
    def.id,
    sanitizePactName(def.name),
    def.mint,
    def.decimals,
    def.bond,
    def.penalty,
    def.period,
    def.origin,
    def.settler,
  ].join('|')
}

export function encodeJoin(pact: string, owner: string) {
  return [PROTOCOL_PREFIX, 'JOIN', pact, owner].join('|')
}

export function encodeIn(pact: string, day: number, owner: string) {
  return [PROTOCOL_PREFIX, 'IN', pact, day, owner].join('|')
}

export function dayAt(def: Pick<PactDef, 'origin' | 'period'>, unixSeconds: number) {
  return Math.floor((unixSeconds - def.origin) / def.period)
}

export function dayStart(def: Pick<PactDef, 'origin' | 'period'>, day: number) {
  return def.origin + day * def.period
}
