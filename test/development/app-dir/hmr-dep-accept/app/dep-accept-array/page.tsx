'use client'

import { useEffect, useState, useRef } from 'react'
import { valueA } from './dep-a'
import { valueB } from './dep-b'

const evaluatedAt = Date.now()

export default function DepAcceptArrayPage() {
  const [depAValue, setDepAValue] = useState(valueA)
  const [depBValue, setDepBValue] = useState(valueB)
  const [acceptCallCount, setAcceptCallCount] = useState(0)
  const [evalTime, setEvalTime] = useState<number | null>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    setEvalTime(evaluatedAt)
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (import.meta.turbopackHot) {
      import.meta.turbopackHot.accept(['./dep-a', './dep-b'], () => {
        const updatedA = require('./dep-a')
        const updatedB = require('./dep-b')
        if (mountedRef.current) {
          setDepAValue(updatedA.valueA)
          setDepBValue(updatedB.valueB)
          setAcceptCallCount((c) => c + 1)
        }
      })
    }
  }, [])

  return (
    <div>
      <p id="dep-a-value">{depAValue}</p>
      <p id="dep-b-value">{depBValue}</p>
      {evalTime !== null && (
        <p id="parent-eval-time">Parent Evaluated At: {evalTime}</p>
      )}
      <p id="accept-call-count">Accept Calls: {acceptCallCount}</p>
    </div>
  )
}
