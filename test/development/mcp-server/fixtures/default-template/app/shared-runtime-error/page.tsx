'use client'

import { useState } from 'react'

const backgroundError = new Error('Test background runtime error')
const sharedError = new Error('Test shared runtime error')

export default function SharedRuntimeErrorPage() {
  const [shouldThrow, setShouldThrow] = useState(false)

  if (shouldThrow) {
    throw sharedError
  }

  return (
    <>
      <p id="shared-page-content">Page remains rendered</p>
      <button
        id="log-background-error"
        onClick={() => console.error(backgroundError)}
      >
        Log background error
      </button>
      <button id="log-shared-error" onClick={() => console.error(sharedError)}>
        Log shared error
      </button>
      <button id="throw-shared-error" onClick={() => setShouldThrow(true)}>
        Throw error
      </button>
    </>
  )
}
