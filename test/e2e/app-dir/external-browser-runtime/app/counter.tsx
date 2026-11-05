'use client'

import { useState } from 'react'

// Exists purely to prove hydration ran: the count only changes if the client
// bundle attached its event handlers.
export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <button id="counter" onClick={() => setCount((c) => c + 1)}>
      count: {count}
    </button>
  )
}
