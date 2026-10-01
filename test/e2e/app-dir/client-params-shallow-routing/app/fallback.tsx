'use client'

import { useLayoutEffect } from 'react'

declare global {
  interface Window {
    fallbackCommits?: number
  }
}

export function Fallback() {
  // Counts how many times the fallback was committed to the screen. A fallback
  // that only shows briefly is easy to miss by polling the DOM from the test.
  useLayoutEffect(() => {
    window.fallbackCommits = (window.fallbackCommits ?? 0) + 1
  }, [])
  return <p id="fallback">Loading...</p>
}
