'use client'

import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)

  return (
    <main style={{ fontFamily: 'system-ui', padding: 48, maxWidth: 680 }}>
      <p>Next.js DevTools · WebMCP</p>
      <h1>Ready to edit</h1>
      <p id="version">version-1</p>
      <p>
        Pause HMR, edit this component, then resume to load the finished
        changes. The counter stays interactive while updates are paused.
      </p>
      <button id="counter" onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    </main>
  )
}
