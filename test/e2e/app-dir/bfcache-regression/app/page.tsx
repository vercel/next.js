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
        <a href="/target-page">MPA Link</a>
      </p>
    </div>
  )
}
