'use client'

import { useState } from 'react'

export default function Page() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <p id="count">{count}</p>
      <button onClick={() => setCount((c) => c + 1)}>increment</button>
    </div>
  )
}
