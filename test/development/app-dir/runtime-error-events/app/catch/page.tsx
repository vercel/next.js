'use client'
import { catchError } from 'next/error'
import { useState } from 'react'
const CustomBoundary = catchError(function CustomFallback() {
  return <p id="fallback">Catch fallback</p>
})
function Broken() {
  const [failed, setFailed] = useState(false)
  if (failed) {
    throw new Error('catch failed')
  }
  return (
    <button id="throw" onClick={() => setFailed(true)}>
      Throw
    </button>
  )
}
export default function Page() {
  return (
    <CustomBoundary>
      <Broken />
    </CustomBoundary>
  )
}
