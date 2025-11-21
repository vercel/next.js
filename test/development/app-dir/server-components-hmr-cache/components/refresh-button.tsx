'use client'

import { useRouter } from 'next/navigation'

export function RefreshButton() {
  const { refresh } = useRouter()

  return (
    <button type="button" onClick={refresh}>
      refresh
    </button>
  )
}
