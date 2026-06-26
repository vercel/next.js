'use client'

import { Suspense } from 'react'
import { useParams } from 'next/navigation'

function LoadingWithParams() {
  const params = useParams<{ slug?: string[] }>()
  const path = params.slug ? params.slug.join('/') : '(index)'
  return <p id="loading-message">Loading docs {path}...</p>
}

export default function Loading() {
  return (
    <div id="loading-boundary">
      <Suspense fallback={<p id="loading-message">Loading docs...</p>}>
        <LoadingWithParams />
      </Suspense>
    </div>
  )
}
