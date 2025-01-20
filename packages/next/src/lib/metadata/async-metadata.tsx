'use client'

import { use } from 'react'
import { useServerInsertedHTML } from '../../client/components/navigation'

// This is a SSR-only version that will wait the promise of metadata to resolve
// and
function ServerInsertMetadata({ promise }: { promise: Promise<any> }) {
  let metadataToFlush: React.ReactNode = null
  // Only inserted once to avoid multi insertion on re-renders
  let inserted = false

  promise.then((resolvedMetadata) => {
    metadataToFlush = resolvedMetadata
  })

  useServerInsertedHTML(() => {
    if (metadataToFlush && !inserted) {
      const flushing = metadataToFlush
      metadataToFlush = null
      return flushing
    }
  })

  inserted = true

  return null
}

function BrowserResolvedMetadata({ promise }: { promise: Promise<any> }) {
  return use(promise)
}

export function AsyncMetadata({ promise }: { promise: Promise<any> }) {
  return (
    <>
      {typeof window === 'undefined' ? (
        <ServerInsertMetadata promise={promise} />
      ) : (
        <BrowserResolvedMetadata promise={promise} />
      )}
    </>
  )
}
