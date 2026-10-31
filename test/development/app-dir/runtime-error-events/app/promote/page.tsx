'use client'
import { useState } from 'react'
const error = new Error('promoted error')
export default function Page() {
  const [failed, setFailed] = useState(false)
  if (failed) {
    throw error
  }
  return (
    <>
      <button id="log" onClick={() => console.error(error)}>
        Log
      </button>
      <button id="throw" onClick={() => setFailed(true)}>
        Throw
      </button>
    </>
  )
}
