'use client'
import React from 'react'
import Link from 'next/link'

export default function Page() {
  const [counter, setCounter] = React.useState(0)
  return (
    <div>
      <h1>BFCache Test</h1>
      <button onClick={() => setCounter((c) => c + 1)}>
        Trigger Re-Render
      </button>
      <div id="counter">{counter}</div>
      <Link href="https://example.vercel.sh">External Page</Link>
    </div>
  )
}
