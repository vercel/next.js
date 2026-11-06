'use client'

import { useEffect, useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  return (
    <button
      id="counter"
      data-hydrated={hydrated ? 'true' : 'false'}
      onClick={() => setCount((c) => c + 1)}
    >
      {count}
    </button>
  )
}
