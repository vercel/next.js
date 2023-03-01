'use client'

import { useState } from 'react'

export default function Counter({ inc, dec }) {
  const [count, setCount] = useState(0)

  return (
    <div>
      <p>Count: {count}</p>
      <button
        onClick={async () => {
          const newCount = await inc(count)
          setCount(newCount)
        }}
      >
        +1
      </button>
      <button
        onClick={async () => {
          const newCount = await dec(count)
          setCount(newCount)
        }}
      >
        -1
      </button>
    </div>
  )
}
