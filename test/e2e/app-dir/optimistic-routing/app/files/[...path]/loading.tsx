'use client'

import { Suspense } from 'react'
import { useParams } from 'next/navigation'

function LoadingWithParams() {
  const params = useParams<{ path: string[] }>()
  const filePath = params.path.join('/')
  return <p id="loading-message">Loading file {filePath}...</p>
}

export default function Loading() {
  return (
    <div id="loading-boundary">
      <Suspense fallback={<p id="loading-message">Loading file...</p>}>
        <LoadingWithParams />
      </Suspense>
    </div>
  )
}
