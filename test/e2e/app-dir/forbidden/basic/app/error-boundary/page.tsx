'use client'
import { forbidden } from 'next/navigation'
import React from 'react'
export default function Page() {
  const [shouldError, setShouldError] = React.useState(false)
  if (shouldError) {
    forbidden()
  }
  return (
    <button
      onClick={() => {
        setShouldError(true)
      }}
    >
      Trigger Forbidden
    </button>
  )
}
