'use client'

import { useState } from 'react'

/** Add your relevant code here for the issue to reproduce */
export default function Page() {
  const [error, setError] = useState(false)
  if (error) {
    throw new Error('This is a test error')
  }
  return (
    <>
      <button onClick={() => setError(true)}>Throw Error</button>
    </>
  )
}
