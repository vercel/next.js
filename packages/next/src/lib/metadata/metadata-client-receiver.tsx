'use client'

import { use, Suspense } from 'react'
import { useServerInsertedHTML } from 'next/navigation'

function MetadataClientReceiverInner({ promise }: { promise: Promise<any> }) {
  const metadataNode = use(promise)
  if (typeof window === 'undefined') return null
  console.log('metadataNode', metadataNode)
  useServerInsertedHTML(() => {
    return <>{metadataNode}</>
  })
  return null
}

export function MetadataClientReceiver({ promise }: { promise: Promise<any> }) {
  console.log('MetadataClientReceiver', typeof window === 'undefined')
  

  return (
    <>
      <Suspense fallback={null}>
        <MetadataClientReceiverInner promise={promise} />
      </Suspense>
    </>
  )
}