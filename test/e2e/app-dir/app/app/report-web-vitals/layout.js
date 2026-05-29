'use client'

import { useState, useEffect } from 'react'

export default function ClientNestedLayout({ children }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    setCount(1)
  }, [])
  return (
    <>
      <h1>Client Nested. Count: {count}</h1>
      <button id="btn" onClick={() => setCount(count + 1)}>
        {count}
      </button>
      {children}
    </>
  )
}
