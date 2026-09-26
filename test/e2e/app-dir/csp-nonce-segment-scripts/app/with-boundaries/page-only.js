'use client'

import { useEffect, useState } from 'react'

export function PageOnly() {
  const [hydrated, setHydrated] = useState(false)
  const [count, setCount] = useState(0)
  useEffect(() => setHydrated(true), [])
  return (
    <button
      id="page-only"
      data-hydrated={hydrated}
      onClick={() => setCount(count + 1)}
    >
      {count}
    </button>
  )
}
