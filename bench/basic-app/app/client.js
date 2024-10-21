'use client'
import { useState } from 'react'

export function Client() {
  const [i, setState] = useState(0)
  return (
    <div>
      Client {i}
      <button onClick={() => setState((v) => v + 1)}>Increment</button>
    </div>
  )
}
