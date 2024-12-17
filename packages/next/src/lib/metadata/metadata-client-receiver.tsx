'use client'

import { Suspense, use, useRef } from 'react'
import { useServerInsertedHTML } from '../../client/components/navigation'

function InnerMetadataClient({ promise }: { promise: Promise<any> }) {
  let onceRef = useRef(false)
  // const metadataNode = use(promise)
  let metadataNode: React.ReactNode = null
  promise.then((resolvedMetadata) => {
    metadataNode = resolvedMetadata
  })
  
  useServerInsertedHTML(() => {
    if (!onceRef.current && metadataNode) {
      onceRef.current = true
      return metadataNode
    }
  })
  
  return null
}

function EnsurePromiseIsResolved({ promise }: { promise: Promise<any> }) {
  use(promise)
  return null
}

export function MetadataClientReceiver({ promise }: { promise: Promise<any> }) {
  return (
    <>
      {typeof window === 'undefined' && <InnerMetadataClient promise={promise} />}
        <Suspense>
          {typeof window !== 'undefined' && (
            <EnsurePromiseIsResolved promise={promise} />
          )}
        </Suspense>
    </>
  )
}