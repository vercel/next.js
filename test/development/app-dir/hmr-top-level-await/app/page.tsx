'use client'
import { useState } from 'react'
import message from '../lib/tla-module'

export default function Page() {
  const [count, setCount] = useState(0)
  return (
    <main>
      <p id="message">{message}</p>
      <p id="count">{count}</p>
      <button id="increment" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
    </main>
  )
}
