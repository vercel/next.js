'use client'

import { useRouter } from 'next/navigation'

export function Refresh() {
  const router = useRouter()
  return (
    <button id="refresh" onClick={() => router.refresh()}>
      refresh
    </button>
  )
}
