'use client'

import { Suspense, use, useRef } from 'react'
import { useServerInsertedHTML } from '../../client/components/navigation'

function InnerMetadataClient({ promise }: { promise: Promise<any> }) {
  let onceRef = useRef(false)
  // const metadataNode = use(promise)
  let metadataNode: React.ReactNode = null
  promise.then((resolvedMetadata) => {
    console.log('resolved metadata')
    metadataNode = resolvedMetadata
  })
  
  useServerInsertedHTML(() => {
    if (!onceRef.current && metadataNode) {
      console.log('insert metadata')
      onceRef.current = true
      return metadataNode
    }
  })
  
  return null
}

export function MetadataClientReceiver({ promise }: { promise: Promise<any> }) {
  return (
    <>
      {typeof window !== 'undefined' && <InnerMetadataClient promise={promise} />}        
    </>
  )
}