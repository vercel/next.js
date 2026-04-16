'use client'

import { useState } from 'react'

export default function Page() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <p id="count">Count: {count}</p>
      <button id="increment" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <p>
        <a href="https://example.com">External Link</a>
      </p>
    </div>
  )
}
