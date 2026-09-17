'use client'

import * as React from 'react'

export default function HydrationMarker() {
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => setHydrated(true), [])

  return hydrated ? <span id="hydrated">true</span> : null
}
