'use client'

import { useEffect, useState, useRef } from 'react'
import { value } from './dep'

// Track when this module was evaluated (should NOT change on dep update)
const evaluatedAt = Date.now()

export default function DepAcceptPage() {
  const [depValue, setDepValue] = useState(value)
  const [acceptCallCount, setAcceptCallCount] = useState(0)
  const [evalTime, setEvalTime] = useState<number | null>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    // Set eval time on client only to avoid hydration mismatch
    setEvalTime(evaluatedAt)
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    // Each bundler exposes its ESM HMR API through import.meta.
    if (import.meta.turbopackHot) {
      import.meta.turbopackHot.accept('./dep', () => {
        // ESM bindings are automatically re-imported before this callback runs,
        // so `value` already reflects the updated module.
        if (mountedRef.current) {
          setDepValue(value)
          setAcceptCallCount((c) => c + 1)
        }
      })
    } else if (import.meta.webpackHot) {
      import.meta.webpackHot.accept('./dep', () => {
        if (mountedRef.current) {
          setDepValue(value)
          setAcceptCallCount((c) => c + 1)
        }
      })
    }
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
