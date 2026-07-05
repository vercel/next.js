'use client'

import { useEffect, useState } from 'react'
import { valueA } from './dep-a'
import { valueB } from './dep-b'

// Track when this module was evaluated
const evaluatedAt = Date.now()

export default function DepDeclineArrayPage() {
  const [evalTime, setEvalTime] = useState<number | null>(null)

  useEffect(() => {
    setEvalTime(evaluatedAt)
  }, [])

  useEffect(() => {
    if (import.meta.turbopackHot) {
      // Decline updates for both dependencies — should trigger full reload
      import.meta.turbopackHot.decline(['./dep-a', './dep-b'])
    }
  }, [])

  return (
    <div>
      <p id="dep-a-value">{valueA}</p>
      <p id="dep-b-value">{valueB}</p>
      {evalTime !== null && (
        <p id="parent-eval-time">Parent Evaluated At: {evalTime}</p>
      )}
    </div>
  )
}
