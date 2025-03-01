'use client'

import { useEffect, useState } from 'react'

export function WaitForHydration() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  if (hydrated) {
    return <div id="ready">hydrated</div>
  }

  return null
}
