'use client'

import { useEffect, useState } from 'react'

// This page tests the actual Next.js DevTools console.error behavior
// by triggering console.error in ways that might cause issues in the handler
export default function DevToolsErrorPage() {
  const [status, setStatus] = useState('waiting')

  useEffect(() => {
    // Track console.error calls to detect infinite loops
    let errorCallCount = 0
    const startTime = Date.now()

    // Wrap the current console.error (which is already patched by Next.js DevTools)
    const currentConsoleError = console.error
    console.error = function (...args: any[]) {
      errorCallCount++

      // If we're getting too many errors too quickly, it's likely an infinite loop
      const elapsed = Date.now() - startTime
      if (errorCallCount > 100 && elapsed < 5000) {
        // Detected infinite loop - restore original and report
        console.error = currentConsoleError
        ;(window as any).__infiniteLoopDetected = true
        ;(window as any).__errorCallCount = errorCallCount
        setStatus('infinite-loop-detected')
        return // Stop the loop
      }

      ;(window as any).__errorCallCount = errorCallCount
      currentConsoleError.apply(console, args)
    }

    // Expose for testing
    ;(window as any).__infiniteLoopDetected = false
    ;(window as any).__errorCallCount = 0
    ;(window as any).__testReady = true

    return () => {
      console.error = currentConsoleError
    }
  }, [])

  // This triggers a console.error that goes through the actual Next.js DevTools handler
  const triggerComplexError = () => {
    setStatus('triggered')
    // Log an error with complex arguments that the DevTools handler processes
    console.error(
      '%c%s%c%o\n\n%s\n\n%s\n',
      'background: #e6e6e6;',
      ' Test ',
      '',
      new Error('Complex error with format string'),
      'Additional context',
      'More info'
    )
  }

  const triggerMalformedArgs = () => {
    setStatus('triggered-malformed')
    // Log errors with unusual arguments that might trip up the handler
    console.error(undefined)
    console.error(null, undefined, { circular: {} })
    console.error(Symbol('test'), BigInt(123))
    // Create circular reference
    const circular: any = { a: 1 }
    circular.self = circular
    console.error('Circular:', circular)
  }

  return (
    <div>
      <h1>DevTools Error Handler Test</h1>
      <p id="status">Status: {status}</p>
      <button id="trigger-complex" onClick={triggerComplexError}>
        Trigger Complex Error
      </button>
      <button id="trigger-malformed" onClick={triggerMalformedArgs}>
        Trigger Malformed Args
      </button>
    </div>
  )
}
