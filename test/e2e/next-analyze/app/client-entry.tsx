'use client'

import { useState } from 'react'

export default function ClientEntry() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>
}
