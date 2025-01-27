'use client'

import { use } from 'react'
import { useServerInsertedHTML } from '../../client/components/navigation'

// We need to wait for metadata on server once it's resolved, and insert into
// the HTML through `useServerInsertedHTML`. It will suspense in <head> during SSR.
function ServerInsertMetadata({ promise }: { promise: Promise<any> }) {
  let metadataToFlush: React.ReactNode = use(promise)

  useServerInsertedHTML(() => {
    if (metadataToFlush) {
      const flushing = metadataToFlush
      // reset to null to ensure we only flush it once
      metadataToFlush = null
      return flushing
    }
  })

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
