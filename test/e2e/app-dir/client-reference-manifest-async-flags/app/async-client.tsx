'use client'

import { useState } from 'react'
import { asyncValue } from './async-value'

export function AsyncClient() {
  const [count, setCount] = useState(0)
  return (
    <button id="async-client" onClick={() => setCount((c) => c + 1)}>
      {asyncValue}: {count}
    </button>
  )
}
