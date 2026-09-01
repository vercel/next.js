'use client'

import { useState } from 'react'

export function PageOnly() {
  const [count, setCount] = useState(0)
  return (
    <button id="page-only" onClick={() => setCount(count + 1)}>
      {count}
    </button>
  )
}
