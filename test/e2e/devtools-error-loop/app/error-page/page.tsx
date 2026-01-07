'use client'

import { useEffect } from 'react'

export default function ErrorPage() {
  useEffect(() => {
    // Call console.error after a short delay to test error handling
    // Using console.error directly ensures the error goes through
    // the patched console.error handler for proper interception
    const timer = setTimeout(() => {
      console.error(new Error('Test error for verification'))
    }, 100)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div>
      <h1>Error Test Page</h1>
      <p>This page calls console.error to verify error handling.</p>
    </div>
  )
}
