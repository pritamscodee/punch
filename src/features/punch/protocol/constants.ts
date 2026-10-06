import { address } from '@solana/kit'

/**
 * Devnet deployment of the PUNCH keeper. The keeper is the SPL delegate members approve for their
 * bond, the settler of every public pact, and the mint authority of the devnet stand-in token.
 */
export const KEEPER_ADDRESS = address('4eT9rZYR18HpwnWiouQsVp5MznCTRsUQMZqSisx8XMNM')

/** Default keeper API. Override with EXPO_PUBLIC_KEEPER_URL at build time or in Settings at runtime. */
export const DEFAULT_KEEPER_URL = process.env.EXPO_PUBLIC_KEEPER_URL ?? 'https://punch-keeper.onrender.com'

export type BondAsset = {
  decimals: number
  /** Cluster this mint lives on. */
  cluster: 'devnet' | 'mainnet'
  mint: ReturnType<typeof address>
  name: string
  note: string
  symbol: string
}

/**
 * Assets a pact can be bonded in. SKR and ORE exist only on mainnet; the devnet build bonds tSKR, a
 * stand-in mint the keeper issues from its faucet. Pacts are created with whichever asset matches
 * the selected cluster.
 */
export const BOND_ASSETS: BondAsset[] = [
  {
    cluster: 'devnet',
    decimals: 6,
    mint: address('GW5xE5qgHUTiTLGzFYXXwkpEUKPPSM3r1u7XVjRvn4x4'),
    name: 'Test SKR',
    note: 'Devnet stand-in for SKR. Free from the faucet.',
    symbol: 'tSKR',
  },
  {
    cluster: 'mainnet',
    decimals: 6,
    mint: address('SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3'),
    name: 'Seeker',
    note: 'The Solana Mobile ecosystem token.',
    symbol: 'SKR',
  },
  {
    cluster: 'mainnet',
    decimals: 11,
    mint: address('oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp'),
    name: 'ORE',
    note: 'Proof-of-work digital gold on Solana.',
    symbol: 'ORE',
  },
]

export function findBondAsset(mint: string) {
  return BOND_ASSETS.find((asset) => asset.mint === mint)
}

/** Pacts the keeper registers on devnet. Shown first on the floor. */
export const PUBLIC_PACT_IDS = ['DAWN', 'DEMO'] as const

export const PROTOCOL_PREFIX = 'PUNCH1'
