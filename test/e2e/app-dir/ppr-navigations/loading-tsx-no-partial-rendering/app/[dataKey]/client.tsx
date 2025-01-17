'use client'

import React, { useState, use } from 'react'

const never = new Promise(() => {})

export function TriggerBadSuspenseFallback() {
  const [shouldSuspend, setShouldSuspend] = useState(false)

  if (shouldSuspend) {
    use(never)
  }

  return (
    <button
      id="trigger-bad-suspense-fallback"
      onClick={() => {
        setShouldSuspend(true)
      }}
    >
      Trigger Bad Suspense Fallback
    </button>
  )
}
