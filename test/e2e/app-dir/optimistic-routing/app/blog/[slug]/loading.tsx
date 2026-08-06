'use client'

import { Suspense } from 'react'
import { useParams } from 'next/navigation'

function LoadingWithSlug() {
  const params = useParams<{ slug: string }>()
  return <p id="loading-message">Loading {params.slug}...</p>
}

export default function Loading() {
  return (
    <div id="loading-boundary">
      <Suspense fallback="Loading...">
        <LoadingWithSlug />
      </Suspense>
    </div>
  )
}
