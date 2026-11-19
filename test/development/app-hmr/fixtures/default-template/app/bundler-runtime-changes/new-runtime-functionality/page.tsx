'use client'
import * as React from 'react'

export default function RuntimeChangesNewRuntimeFunctionalityPage() {
  const [count, setCount] = React.useState(0)
  return (
    <button
      data-testid="new-runtime-functionality-page"
      onClick={() => setCount(count + 1)}
    >
      Count: {count}
    </button>
  )
}
