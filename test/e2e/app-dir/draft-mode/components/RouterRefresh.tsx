'use client'

import { useRouter } from 'next/navigation'
import React from 'react'

export function RouteRefresher() {
  const router = useRouter()

  return (
    <button id="refresh" onClick={() => router.refresh()}>
      Refresh
    </button>
  )
}
