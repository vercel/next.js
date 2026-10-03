'use client'
import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  const [counter, setCounter] = React.useState(0)
  return (
    <div>
      <h1>BFCache Test</h1>
      <button onClick={() => setCounter((c) => c + 1)}>
        Trigger Re-Render
      </button>
      <button
        id="transition"
        onClick={() => React.startTransition(() => setCounter((c) => c + 1))}
      >
        Trigger Re-Render in a Transition
      </button>
      <button
        id="push-external"
        onClick={() => router.push('https://example.vercel.sh')}
      >
        Push External Page
      </button>
      <div id="counter">{counter}</div>
      <Link href="https://example.vercel.sh">External Page</Link>
    </div>
  )
}
