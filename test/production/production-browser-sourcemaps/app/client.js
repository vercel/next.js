'use client'

import { useState } from 'react'

export function ReactCompilerSourceMapClient() {
  const [count, setCount] = useState(0)
  const originalSourceMapMarker = 'original-source-map-marker'

  return (
    <button onClick={() => setCount(count + 1)}>
      {originalSourceMapMarker}: {count}
    </button>
  )
}
