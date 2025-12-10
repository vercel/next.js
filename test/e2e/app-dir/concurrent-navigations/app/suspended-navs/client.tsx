'use client'

import { useRouter } from 'next/navigation'

export function ClientRefreshButton() {
  const router = useRouter()
  return (
    <form>
      <button id="client-refresh-button" formAction={() => router.refresh()}>
        router.refresh()
      </button>
    </form>
  )
}
