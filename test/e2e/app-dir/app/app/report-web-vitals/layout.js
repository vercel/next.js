'use client'

import { useState, useEffect } from 'react'
import Reporter from './reporter'

export default function ClientNestedLayout({ children }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    setCount(1)
  }, [])
  return (
    <>
      <Reporter />
      <h1>Client Nested. Count: {count}</h1>
      <button id="btn" onClick={() => setCount(count + 1)}>
        {count}
      </button>
      {children}
    </>
  )
}
