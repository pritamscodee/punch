import { dayAt, dayStart, type PactDef, type PunchRecord } from './records'

/** One successful transaction on a pact's clock address. */
export type LedgerEntry = {
  blockTime: number
  records: PunchRecord[]
  signature: string
}

export type Settlement = Extract<PunchRecord, { kind: 'settle' }> & { signature: string }

export type Punch = { blockTime: number; day: number; owner: string; signature: string }

export type Ledger = {
  def: PactDef | null
  definedBy: string | null
  /** owner -> unix seconds of their first JOIN */
  members: Map<string, number>
  /** day -> punches that day, earliest first */
  punches: Map<number, Punch[]>
  settlements: Map<number, Settlement>
}

/**
 * Same rules as the keeper: a punch counts only for the day the cluster recorded it in, and only
 * for members. The app reads memo text; the keeper additionally checks each claim against the
 * transaction's signers before it moves any tokens.
 */
export function buildLedger(pactId: string, entries: readonly LedgerEntry[]): Ledger {
  const ledger: Ledger = {
    def: null,
    definedBy: null,
    members: new Map(),
    punches: new Map(),
    settlements: new Map(),
  }
  const ordered = [...entries].sort((a, b) => a.blockTime - b.blockTime)

  for (const entry of ordered) {
    for (const record of entry.records) {
      if (record.kind === 'pact') {
        if (record.def.id === pactId && !ledger.def) {
          ledger.def = record.def
          ledger.definedBy = entry.signature
        }
        continue
      }
      if (record.pact !== pactId) {
        continue
      }
      switch (record.kind) {
        case 'join':
          if (!ledger.members.has(record.owner)) {
            ledger.members.set(record.owner, entry.blockTime)
          }
          break
        case 'in': {
          const def = ledger.def
          if (!def || dayAt(def, entry.blockTime) !== record.day || !ledger.members.has(record.owner)) {
            break
          }
          const day = ledger.punches.get(record.day) ?? []
          if (!day.some((punch) => punch.owner === record.owner)) {
            day.push({ blockTime: entry.blockTime, day: record.day, owner: record.owner, signature: entry.signature })
            ledger.punches.set(record.day, day)
          }
          break
        }
        case 'settle':
          if (!ledger.settlements.has(record.day)) {
            ledger.settlements.set(record.day, { ...record, signature: entry.signature })
          }
          break
      }
    }
  }
  return ledger
}

/** Members who were in the pact for the whole of `day` and so are on the hook for it. */
export function eligibleMembers(ledger: Ledger, day: number) {
  if (!ledger.def) {
    return []
  }
  const start = dayStart(ledger.def, day)
  return [...ledger.members].filter(([, joined]) => joined < start).map(([owner]) => owner)
}

export type DayState = 'paid' | 'missed' | 'open' | 'grace' | 'idle'

export type MemberStats = {
  best: number
  /** Day index of the current shift. */
  currentDay: number
  /** Unix seconds when the current shift closes. */
  closesAt: number
  /** Unix seconds when the current shift opened. */
  opensAt: number
  isMember: boolean
  /** First day the member is on the hook for (the first full shift after joining). */
  firstDay: number | null
  joinedAt: number | null
  missed: number
  punched: number
  punchedToday: Punch | null
  streak: number
  /** Last 28 shifts, oldest first. */
  recent: { day: number; state: DayState }[]
  /** Shifts the member has been liable for, excluding the current one. */
  liable: number
}

export function memberStats(ledger: Ledger, owner: string | null, now: number): MemberStats | null {
  const def = ledger.def
  if (!def) {
    return null
  }
  const currentDay = dayAt(def, now)
  const joinedAt = owner ? (ledger.members.get(owner) ?? null) : null
  const firstDay = joinedAt === null ? null : dayAt(def, joinedAt) + 1
  const days = new Set<number>()
  let punchedToday: Punch | null = null

  if (owner) {
    for (const [day, punches] of ledger.punches) {
      const punch = punches.find((item) => item.owner === owner)
      if (punch) {
        days.add(day)
        if (day === currentDay) {
          punchedToday = punch
        }
      }
    }
  }

  // The run counts back from today if paid, otherwise from yesterday: an open shift is not a miss yet.
  let streak = 0
  for (let day = punchedToday ? currentDay : currentDay - 1; days.has(day); day--) {
    streak++
  }

  let best = 0
  let run = 0
  for (const day of [...days].sort((a, b) => a - b)) {
    run = days.has(day - 1) ? run + 1 : 1
    best = Math.max(best, run)
  }

  const liableFrom = firstDay ?? currentDay
  const liable = Math.max(0, currentDay - liableFrom)
  let missed = 0
  for (let day = liableFrom; day < currentDay; day++) {
    if (!days.has(day)) {
      missed++
    }
  }

  const recent: MemberStats['recent'] = []
  for (let day = currentDay - 27; day <= currentDay; day++) {
    let state: DayState = 'idle'
    if (days.has(day)) {
      state = 'paid'
    } else if (day === currentDay) {
      state = joinedAt === null ? 'idle' : 'open'
    } else if (firstDay !== null && day >= firstDay) {
      state = 'missed'
    } else if (joinedAt !== null && day === firstDay! - 1) {
      state = 'grace'
    }
    recent.push({ day, state })
  }

  return {
    best: Math.max(best, streak),
    closesAt: dayStart(def, currentDay + 1),
    currentDay,
    firstDay,
    isMember: joinedAt !== null,
    joinedAt,
    liable,
    missed,
    opensAt: dayStart(def, currentDay),
    punched: days.size,
    punchedToday,
    recent,
    streak,
  }
}

/** Estimated net result for an owner from on-chain SETTLE records (exact figures come from the keeper). */
export function estimateEarnings(ledger: Ledger, owner: string) {
  const def = ledger.def
  if (!def) {
    return { earned: 0n, lost: 0n }
  }
  let earned = 0n
  let lost = 0n
  for (const [day, settlement] of ledger.settlements) {
    if (settlement.paid === 0n) {
      continue
    }
    const punchedThatDay = ledger.punches.get(day)?.some((punch) => punch.owner === owner) ?? false
    if (punchedThatDay && settlement.punched > 0) {
      earned += settlement.paid / BigInt(settlement.punched)
    } else if (eligibleMembers(ledger, day).includes(owner)) {
      lost += def.penalty
    }
  }
  return { earned, lost }
}
