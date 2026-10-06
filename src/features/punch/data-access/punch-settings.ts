import { useStore } from '@nanostores/react'
import { atom } from 'nanostores'
import { createMMKV } from 'react-native-mmkv'

import { APP_STORAGE_ID } from '@/features/cluster/data-access/create-cluster-props'
import { DEFAULT_KEEPER_URL } from '@/features/punch/protocol/constants'

export const punchStorage = createMMKV({ id: APP_STORAGE_ID })

export type PunchSettings = {
  /** Pact shown on the Clock tab. */
  activePactId: string | null
  keeperUrl: string
  remindersEnabled: boolean
}

const SETTINGS_KEY = 'punch:settings'
const DEFAULTS: PunchSettings = { activePactId: 'DEMO', keeperUrl: DEFAULT_KEEPER_URL, remindersEnabled: true }

function load(): PunchSettings {
  try {
    const raw = punchStorage.getString(SETTINGS_KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<PunchSettings>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export const $punchSettings = atom<PunchSettings>(load())

export function updatePunchSettings(patch: Partial<PunchSettings>) {
  const next = { ...$punchSettings.get(), ...patch }
  punchStorage.set(SETTINGS_KEY, JSON.stringify(next))
  $punchSettings.set(next)
}

export function usePunchSettings() {
  return useStore($punchSettings)
}
