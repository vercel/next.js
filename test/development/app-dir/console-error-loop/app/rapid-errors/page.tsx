'use client'

import { useEffect } from 'react'

export default function RapidErrorsPage() {
  useEffect(() => {
    // Initialize error counter
    ;(window as any).__errorCount = 0

    // Patch console.error to count calls
    const originalError = console.error
    console.error = function (...args: any[]) {
      ;(window as any).__errorCount++
      originalError.apply(console, args)
    }

    return () => {
      console.error = originalError
    }
  }, [])

  const triggerRapidErrors = () => {
    // Trigger multiple console.errors rapidly
    for (let i = 0; i < 10; i++) {
      console.error(new Error(`Rapid error ${i}`))
    }
  }

  return (
    <div>
      <h1>Rapid Console Errors Test</h1>
      <button id="trigger-rapid-errors" onClick={triggerRapidErrors}>
        Trigger Rapid Errors
      </button>
    </div>
  )
}
