'use client'

import { useState } from 'react'
import './counter-2.css'

export default function () {
  const [count, setCount] = useState(0)
  return (
    <div className="counter2">
      this is counter 2 (limegreen):
      <button onClick={() => setCount(count - 1)}>-</button>
      <button onClick={() => setCount(count + 1)}>+</button>
      <span>{count}</span>
    </div>
  )
}
