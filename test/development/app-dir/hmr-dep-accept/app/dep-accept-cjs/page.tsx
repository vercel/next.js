'use client'

import { useEffect, useState } from 'react'
import { getValue, getAcceptCallCount, subscribe } from './dep-observer.cjs'

// Track when this module was evaluated (should NOT change on dep update)
const evaluatedAt = Date.now()

export default function DepAcceptCjsPage() {
  const [depValue, setDepValue] = useState(getValue())
  const [acceptCallCount, setAcceptCallCount] = useState(getAcceptCallCount())
  const [evalTime, setEvalTime] = useState<number | null>(null)

  useEffect(() => {
    setEvalTime(evaluatedAt)
    // dep-observer.cjs registers module.hot.accept('./dep', cb) in CJS context.
    // When dep.ts changes, the CJS module handles it and notifies subscribers.
    return subscribe((newValue: string, newCount: number) => {
      setDepValue(newValue)
      setAcceptCallCount(newCount)
    })
  }, [])

  return (
    <div>
      <p id="dep-value">{depValue}</p>
      {evalTime !== null && (
        <p id="parent-eval-time">Parent Evaluated At: {evalTime}</p>
      )}
      <p id="accept-call-count">Accept Calls: {acceptCallCount}</p>
    </div>
  )
}
