'use client'

import { useRouter } from 'next/navigation'

export default function RefreshClientPage() {
  const router = useRouter()

  return (
    <button
      id="refresh"
      onClick={() => {
        router.refresh()
      }}
    >
      Refresh page (@refresh/client.tsx)
    </button>
  )
}
