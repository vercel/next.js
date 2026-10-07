'use client'

import { useState } from 'react'

export function DelayedClientComponent() {
  const [count, setCount] = useState(0)
  return (
    // The test holds back the chunk that contains this marker.
    <button
      id="increment"
      data-marker="DELAYED_CLIENT_COMPONENT"
      onClick={() => setCount((c) => c + 1)}
    >
      Count: {count}
    </button>
  )
}
