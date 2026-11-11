'use client'

import { useState } from 'react'

export function PlainClient() {
  const [count, setCount] = useState(0)
  return (
    <button id="plain-client" onClick={() => setCount((c) => c + 1)}>
      plain value: {count}
    </button>
  )
}
