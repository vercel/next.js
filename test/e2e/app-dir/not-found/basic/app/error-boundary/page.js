'use client'
import { notFound } from 'next/navigation'
import React from 'react'
export default function Page() {
  const [shouldError, setShouldError] = React.useState(false)
  if (shouldError) {
    notFound()
  }
  return (
    <button
      onClick={() => {
        setShouldError(true)
      }}
    >
      Trigger Not Found
    </button>
  )
}
