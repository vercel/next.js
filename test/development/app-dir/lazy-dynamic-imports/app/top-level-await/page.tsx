'use client'

import { useState } from 'react'

export default function Page() {
  const [result, setResult] = useState('top-level await idle')

  return (
    <button
      id="load-top-level-await"
      onClick={async () => setResult((await import('./target')).value)}
    >
      {result}
    </button>
  )
}
