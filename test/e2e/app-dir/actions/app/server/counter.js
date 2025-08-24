'use client'

import { useState } from 'react'

export default function Counter({ inc, dec, double, slowInc }) {
  const [count, setCount] = useState(0)

  return (
    <div>
      <h1 id="count">{count}</h1>
      <button
        id="inc"
        onClick={async () => {
          const newCount = await inc(count)
          setCount(newCount)
        }}
      >
        +1
      </button>
      <button
        id="slow-inc"
        onClick={async () => {
          const newCount = await slowInc(count)
          setCount(newCount)
        }}
      >
        +1 (Slow)
      </button>
      <button
        id="dec"
        onClick={async () => {
          const newCount = await dec(count)
          setCount(newCount)
        }}
      >
        -1
      </button>
      <button
        id="double"
        onClick={async () => {
          const newCount = await double(count)
          setCount(newCount)
        }}
      >
        *2
      </button>
    </div>
  )
}
