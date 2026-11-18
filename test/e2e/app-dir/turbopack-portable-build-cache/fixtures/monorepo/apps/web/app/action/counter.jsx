'use client'

import { useState } from 'react'
import { increment } from './actions'

export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <button onClick={async () => setCount(await increment(count))}>
      count {count}
    </button>
  )
}
