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
