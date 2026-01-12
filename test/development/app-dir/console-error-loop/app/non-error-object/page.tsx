'use client'

import { useEffect } from 'react'

export default function NonErrorObjectPage() {
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

  return (
    <div>
      <h1>Non-Error Object Console Error Test</h1>
      <button
        id="trigger-string-error"
        onClick={() => console.error('String error message')}
      >
        Trigger String Error
      </button>
      <button
        id="trigger-object-error"
        onClick={() => console.error({ message: 'Object error', code: 123 })}
      >
        Trigger Object Error
      </button>
      <button
        id="trigger-null-error"
        onClick={() => console.error(null, undefined, 'mixed args')}
      >
        Trigger Null Error
      </button>
    </div>
  )
}
