'use client'

import { useEffect, useState } from 'react'

export function Shell() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <h1 id="shell" data-hydrated={hydrated}>
      Static shell
    </h1>
  )
}
