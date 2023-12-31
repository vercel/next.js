'use client'

import { useState } from 'react'

export default function Counter({
  dictionary,
}: {
  dictionary: {
    increment: string
    decrement: string
  }
}) {
  const [count, setCount] = useState(0)
  return (
    <p>
      This component is rendered on client:
      <button onClick={() => setCount((n) => n - 1)}>
        {dictionary.decrement}
      </button>
      {count}
      <button onClick={() => setCount((n) => n + 1)}>
        {dictionary.increment}
      </button>
    </p>
  )
}
