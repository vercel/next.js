'use client'

import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)
  return (
    <>
      <p id="version">version-1</p>
      <button id="counter" onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    </>
  )
}
