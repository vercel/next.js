'use client'

import { useEffect, useState } from 'react'

export function HydrationMarker() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <span
      data-testid="app-hydration-marker"
      data-hydrated={hydrated ? 'true' : 'false'}
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
