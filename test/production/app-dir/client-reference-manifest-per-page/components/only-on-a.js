'use client'

import { useState } from 'react'

export function OnlyOnA() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>only on a {count}</button>
}
