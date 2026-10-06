import { formatUnits } from '@/features/punch/data-access/use-pact'
import { findBondAsset, KEEPER_ADDRESS } from '@/features/punch/protocol/constants'
import type { PactDef } from '@/features/punch/protocol/records'

export function assetSymbol(def: Pick<PactDef, 'mint'>) {
  return findBondAsset(def.mint)?.symbol ?? 'TOKEN'
}

export function formatAmount(def: Pick<PactDef, 'decimals' | 'mint'>, amount: bigint | number) {
  return `${formatUnits(BigInt(amount), def.decimals)} ${assetSymbol(def)}`
}

export function isTrustedSettler(def: Pick<PactDef, 'settler'>) {
  return def.settler === KEEPER_ADDRESS
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
})

export function formatClock(unixSeconds: number) {
  return timeFormat.format(new Date(unixSeconds * 1000))
}

export function formatStamp(unixSeconds: number) {
  return dateFormat.format(new Date(unixSeconds * 1000))
}

export function runUnit(def: Pick<PactDef, 'period'>, count: number) {
  const unit = def.period === 86_400 ? 'day' : 'shift'
  return `${unit}${count === 1 ? '' : 's'}`.toUpperCase()
}
