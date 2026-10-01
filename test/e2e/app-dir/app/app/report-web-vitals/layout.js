'use client'

import { useState, useEffect } from 'react'
import Reporter from './reporter'

export default function ClientNestedLayout({ children }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    setCount(1)
  }, [])

  function handleClick() {
    const start = performance.now()
    while (performance.now() - start < 200) {
      // Ensure this interaction exceeds web-vitals' INP duration threshold.
    }
    setCount(count + 1)
  }

  return (
    <>
      <Reporter />
      <h1>Client Nested. Count: {count}</h1>
      <button id="btn" onClick={handleClick}>
        {count}
      </button>
      {children}
    </>
  )
}
