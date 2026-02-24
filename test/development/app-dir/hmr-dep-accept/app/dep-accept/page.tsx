'use client'

import { useEffect, useState, useRef } from 'react'
import { value } from './dep'

// TypeScript declaration for module.hot (not available in ESM by default)
declare const module: { hot?: { accept(dep: string, cb: () => void): void } }

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
    // Use typeof guard to avoid ReferenceError in ESM modules
    console.log('[DEBUG] typeof module:', typeof module)
    console.log('[DEBUG] module:', module)
    console.log('[DEBUG] module?.hot:', module?.hot)
    if (typeof module !== 'undefined' && module.hot) {
      console.log('[DEBUG] Registering module.hot.accept for ./dep')
      module.hot.accept('./dep', () => {
        console.log('[DEBUG] Accept callback fired!')
        // Re-import the updated module to get new value
        const updated = require('./dep')
        console.log('[DEBUG] updated.value:', updated.value)
        if (mountedRef.current) {
          setDepValue(updated.value)
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
