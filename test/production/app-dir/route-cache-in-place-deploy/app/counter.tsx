'use client'

import { useState } from 'react'
import { build } from './build'

export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <button id="counter" onClick={() => setCount(count + 1)}>
      {build} clicks: {count}
    </button>
  )
}
