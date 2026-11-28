'use client'

import { useState } from 'react'

// Counts evaluations of this module so the test can tell a single hot update
// apart from an update that was applied more than once.
if (typeof window !== 'undefined') {
  ;(window as any).__plainEvaluations =
    ((window as any).__plainEvaluations ?? 0) + 1
}

export function Label() {
  const [count, setCount] = useState(0)
  return (
    <>
      <h1 id="label">plain before edit</h1>
      <button id="increment" onClick={() => setCount((c) => c + 1)}>
        {count}
      </button>
    </>
  )
}
