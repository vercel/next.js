'use client'

import { useState } from 'react'
import './counter-1.css'

export default function () {
  const [count, setCount] = useState(0)
  return (
    <div className="counter1">
      this is counter 1 (red):
      <button onClick={() => setCount(count - 1)}>-</button>
      <button onClick={() => setCount(count + 1)}>+</button>
      <span>{count}</span>
    </div>
  )
}
