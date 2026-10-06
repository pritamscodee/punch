import { useLocalSearchParams } from 'expo-router'

import { PunchFeaturePact } from '@/features/punch/punch-feature-pact'

export default function PactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <PunchFeaturePact id={String(id ?? '').toUpperCase()} />
}
