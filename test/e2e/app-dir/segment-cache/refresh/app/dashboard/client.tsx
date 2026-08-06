'use client'

import { useRouter } from 'next/navigation'

export function ClientRefreshButton() {
  const router = useRouter()
  return (
    <button
      id="client-refresh-button"
      onClick={() => {
        router.refresh()
      }}
    >
      Client refresh
    </button>
  )
}
