'use client'

import { useEffect, useState } from 'react'
import { value } from './dep'

// Track when this module was evaluated
const evaluatedAt = Date.now()

export default function DepDeclinePage() {
  const [evalTime, setEvalTime] = useState<number | null>(null)

  useEffect(() => {
    setEvalTime(evaluatedAt)
  }, [])

  useEffect(() => {
    if (import.meta.turbopackHot) {
      // Decline updates for this dependency — should trigger full reload
      import.meta.turbopackHot.decline('./dep')
    }
  }, [])

  return (
    <div>
      <p id="dep-value">{value}</p>
      {evalTime !== null && (
        <p id="parent-eval-time">Parent Evaluated At: {evalTime}</p>
      )}
    </div>
  )
}
