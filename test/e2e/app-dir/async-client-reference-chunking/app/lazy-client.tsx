'use client'

import { useState } from 'react'

export default function LazyClient() {
  const [count, setCount] = useState(0)
  return (
    <button id="lazy" onClick={() => setCount(count + 1)}>
      lazy {count}
    </button>
  )
}
