'use client'

import { useRouter } from 'next/navigation'

export default function RefreshErrorPage({ reset }) {
  const router = useRouter()

  return (
    <button
      id="refresh"
      onClick={() => {
        router.refresh()
        reset()
      }}
    >
      Refresh page (this should not be shown)
    </button>
  )
}
