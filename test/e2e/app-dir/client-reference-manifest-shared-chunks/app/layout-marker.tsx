'use client'

import { useEffect, useState } from 'react'

export function LayoutMarker() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return <p id="layout-marker">{hydrated ? 'hydrated' : 'not hydrated'}</p>
}
