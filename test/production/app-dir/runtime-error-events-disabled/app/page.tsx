'use client'

import { useState } from 'react'

export default function Page() {
  const [count, setCount] = useState(0)
  return (
    <>
      <button
        id="throw"
        onClick={() => {
          throw new Error('production event failed')
        }}
      >
        Throw
      </button>
      <button id="increment" onClick={() => setCount(count + 1)}>
        Increment
      </button>
      <p id="count">{count}</p>
    </>
  )
}
