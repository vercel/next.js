'use client'

import { Suspense, use } from 'react'
import type { StreamingMetadataResolvedState } from './types'

export const AsyncMetadata =
  typeof window === 'undefined'
    ? (
        require('./server-inserted-metadata') as typeof import('./server-inserted-metadata')
      ).ServerInsertMetadata
    : (
        require('./browser-resolved-metadata') as typeof import('./browser-resolved-metadata')
      ).BrowserResolvedMetadata

function MetadataOutlet({
  promise,
}: {
  promise: Promise<StreamingMetadataResolvedState>
}) {
  const { error, digest } = use(promise)
  if (error) {
    if (digest) {
      // The error will lose its original digest after passing from server layer to client layer；
      // We recover the digest property here to override the React created one if original digest exists.
      ;(error as any).digest = digest
    }
    throw error
  }
  return null
}

export function AsyncMetadataOutlet({
  promise,
}: {
  promise: Promise<StreamingMetadataResolvedState>
}) {
  return (
    <Suspense fallback={null}>
      <MetadataOutlet promise={promise} />
    </Suspense>
  )
}
