'use client'

import { useState } from 'react'

export default function Page() {
  const [shouldThrow, setShouldThrow] = useState(false)

  if (shouldThrow) {
    throw new Error('devtools basePath test error')
  }

  return <button onClick={() => setShouldThrow(true)}>Trigger error</button>
}
