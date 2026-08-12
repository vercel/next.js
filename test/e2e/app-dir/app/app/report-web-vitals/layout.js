'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Reporter from './reporter'

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
      <Link href="/report-web-vitals/destination" id="to-destination">
        To destination
      </Link>
      {/* Rendered by the layout, so that it stays mounted across client-side
          navigations, like a root layout would. */}
      <Reporter />
      {children}
    </>
  )
}
