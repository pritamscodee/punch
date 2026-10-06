// Prints the clock and registry addresses the app derives, for comparison with the keeper.
import { getClockAddress, getRegistryAddress } from '../src/features/punch/protocol/addresses'

async function main() {
  for (const id of process.argv.slice(2).length ? process.argv.slice(2) : ['DAWN', 'DEMO']) {
    console.log(id, await getClockAddress(id))
  }
  console.log('registry', await getRegistryAddress())
}

void main()
