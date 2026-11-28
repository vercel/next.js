'use client'

import { useEffect, useState } from 'react'

export function HydrationMarker() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  return <p id="hydrated">{String(hydrated)}</p>
}
