'use client'

import { useState } from 'react'
import { clientValue } from '../client-value'

export function ClientComponent() {
  const [count, setCount] = useState(0)
  return (
    <>
      <p id="client-value">{clientValue}</p>
      <button id="increment" onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    </>
  )
}
