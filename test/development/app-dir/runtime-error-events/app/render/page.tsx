'use client'
import { useState } from 'react'
export default function Page() {
  const [failed, setFailed] = useState(false)
  if (failed) {
    throw new Error('render failed')
  }
  return (
    <button id="throw" onClick={() => setFailed(true)}>
      Throw
    </button>
  )
}
