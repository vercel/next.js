'use client'

import { inc } from '../client/actions'
import { useState } from 'react'

export function CSR() {
  const [count, setCount] = useState(0)
  return (
    <button onClick={async () => setCount(await inc(count))}>{count}</button>
  )
}
