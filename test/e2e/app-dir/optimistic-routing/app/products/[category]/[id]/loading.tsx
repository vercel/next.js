'use client'

import { Suspense } from 'react'
import { useParams } from 'next/navigation'

function LoadingWithParams() {
  const params = useParams<{ category: string; id: string }>()
  return (
    <p id="loading-message">
      Loading {params.category}/{params.id}...
    </p>
  )
}

export default function Loading() {
  return (
    <div id="loading-boundary">
      <Suspense fallback={<p id="loading-message">Loading product...</p>}>
        <LoadingWithParams />
      </Suspense>
    </div>
  )
}
