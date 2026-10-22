'use client'

import { useRouter } from 'next/navigation'

export default function RefreshErrorBoundaryPage() {
  const router = useRouter()

  return (
    <button
      id="refresherrorboundary"
      onClick={() => {
        router.refresh()
      }}
    >
      Refresh page (@refresherrorboundary/error.tsx)
    </button>
  )
}
