'use client'

import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    // Initialize error counter
    ;(window as any).__errorCount = 0

    // Patch console.error to count calls (for testing purposes)
    const originalError = console.error
    console.error = function (...args: any[]) {
      ;(window as any).__errorCount++
      originalError.apply(console, args)
    }

    return () => {
      console.error = originalError
    }
  }, [])

  const triggerError = () => {
    console.error(new Error('Test error for console loop check'))
  }

  return (
    <div>
      <h1>Console Error Loop Test</h1>
      <button id="trigger-error" onClick={triggerError}>
        Trigger Console Error
      </button>
    </div>
  )
}
