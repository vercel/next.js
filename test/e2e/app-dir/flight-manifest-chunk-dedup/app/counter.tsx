'use client'
import React, { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div id="client-counter">
      <span id="counter-value">{count}</span>
      <button id="counter-btn" onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  )
}
