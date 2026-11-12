'use client'

import { useState } from 'react'

export function OnlyOnB() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>only on b {count}</button>
}
