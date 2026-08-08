'use client'

import { useState } from 'react'

export default function TriggerErrorPage() {
  const [shouldError, setShouldError] = useState(false)

  if (shouldError) {
    throw new Error('Test client error')
  }

  return (
    <div>
      <h1>Trigger Error Page</h1>
      <button id="trigger-error" onClick={() => setShouldError(true)}>
        Trigger Error
      </button>
    </div>
  )
}
