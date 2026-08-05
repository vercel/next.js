'use client'

import { useState } from 'react'

export function EagerClient() {
  const [count, setCount] = useState(0)
  return (
    <button id="eager" onClick={() => setCount(count + 1)}>
      eager {count}
    </button>
  )
}
