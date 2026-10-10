'use client'

import { useState } from 'react'

// Shared client component imported by every route. Because it is used by
// multiple chunk groups it becomes a candidate for a shared chunk, which the
// chunker may or may not merge depending on the configured thresholds.
export function Shared({ label }: { label: string }) {
  const [count, setCount] = useState(0)
  return (
    <button id="shared-button" onClick={() => setCount((c) => c + 1)}>
      {label}: {count}
    </button>
  )
}
