'use client'

import { useState } from 'react'

export function AsyncOnly() {
  const [count, setCount] = useState(0)
  return (
    <button id="async-only" onClick={() => setCount(count + 1)}>
      async-only-marker {count}
    </button>
  )
}
