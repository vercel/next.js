'use client'

import { useRouter } from 'next/navigation'

export function PrefetchButton() {
  const router = useRouter()
  return (
    <button
      id="prefetch-offline-navigation"
      onClick={() => router.prefetch('/prefetched')}
    >
      Prefetch offline navigation
    </button>
  )
}

export function DynamicPatternSourcePrefetchButton() {
  const router = useRouter()
  return (
    <button
      id="prefetch-dynamic-pattern-source"
      onClick={() => router.prefetch('/dynamic-prefetch/learned')}
    >
      Prefetch dynamic pattern source
    </button>
  )
}

export function DynamicPatternTargetPrefetchButton() {
  const router = useRouter()
  return (
    <button
      id="prefetch-dynamic-pattern-target"
      onClick={() => router.prefetch('/dynamic-prefetch/replayed')}
    >
      Prefetch dynamic pattern target
    </button>
  )
}

export function RefreshButton() {
  const router = useRouter()
  return (
    <button id="refresh-offline-navigation" onClick={() => router.refresh()}>
      Refresh offline navigation
    </button>
  )
}
