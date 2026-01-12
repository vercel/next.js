'use client'

import { useEffect, useState } from 'react'

// This page simulates the bug from https://github.com/vercel/next.js/issues/88234
// where an internal error in the console.error handler causes an infinite loop
export default function InternalErrorPage() {
  const [errorCount, setErrorCount] = useState(0)
  const [testComplete, setTestComplete] = useState(false)

  useEffect(() => {
    // Track how many times console.error is called
    let count = 0
    const originalError = console.error

    // This simulates what happens when Next.js DevTools intercepts console.error
    // and an internal error occurs during processing
    console.error = function (...args: any[]) {
      count++
      setErrorCount(count)

      // Simulate an internal error that would occur during console.error processing
      // This is similar to what happens with the _interop_require_wildcard bug
      if (count === 1) {
        // On the first call, throw an error that will be caught and logged
        // If there's no protection, this causes an infinite loop
        try {
          // Simulate internal processing that fails
          const faultyFunction = (undefined as any).notAFunction
          faultyFunction()
        } catch (internalError) {
          // In the buggy scenario, this error gets logged via console.error
          // which triggers the patched console.error again
          originalError.call(console, 'Internal DevTools error:', internalError)
        }
      }

      // Call original to actually log
      originalError.apply(console, args)
    }

    // Expose count for the test
    ;(window as any).__internalErrorCount = () => count

    // After 3 seconds, mark test complete and check the count
    const timeout = setTimeout(() => {
      setTestComplete(true)
      ;(window as any).__finalErrorCount = count
    }, 3000)

    return () => {
      console.error = originalError
      clearTimeout(timeout)
    }
  }, [])

  const triggerError = () => {
    console.error('Test error to trigger the bug')
  }

  return (
    <div>
      <h1>Internal Error Test</h1>
      <p id="error-count">Error count: {errorCount}</p>
      <p id="test-status">{testComplete ? 'Test complete' : 'Testing...'}</p>
      <button id="trigger-internal-error" onClick={triggerError}>
        Trigger Error with Internal Failure
      </button>
    </div>
  )
}
