import { getProgramDerivedAddress, type Address } from '@solana/kit'
import { MEMO_PROGRAM_ADDRESS } from '@solana-program/memo'

const cache = new Map<string, Promise<Address>>()

function derive(key: string, seeds: string[]) {
  let address = cache.get(key)
  if (!address) {
    address = getProgramDerivedAddress({ programAddress: MEMO_PROGRAM_ADDRESS, seeds }).then(([pda]) => pda)
    cache.set(key, address)
  }
  return address
}

/** Every record of a pact touches its clock address, so its signature list is the pact's history. */
export function getClockAddress(pactId: string) {
  return derive(`clock:${pactId}`, ['punch-clock', pactId])
}

/** Every pact definition also touches the registry, so pacts are discoverable without an indexer. */
export function getRegistryAddress() {
  return derive('registry', ['punch-registry'])
}
