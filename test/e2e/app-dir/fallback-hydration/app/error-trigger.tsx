'use client'

import { useState, type ReactNode } from 'react'

export function ErrorTrigger({ children }: { children: ReactNode }) {
  const [shouldThrow, setShouldThrow] = useState(false)

  if (shouldThrow) {
    throw new Error('Root failed after fallback recovery')
  }

  return (
    <>
      <button id="throw-root-error" onClick={() => setShouldThrow(true)}>
        Throw root error
      </button>
      {children}
    </>
  )
}
