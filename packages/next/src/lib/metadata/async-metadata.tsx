'use client'

import { use, type JSX } from 'react'
import { useServerInsertedMetadata } from '../../server/app-render/metadata-insertion/use-server-inserted-metadata'

function ServerInsertMetadata({ promise }: { promise: Promise<JSX.Element> }) {
  // Apply use() to the metadata promise to suspend the rendering in SSR.
  const metadata = use(promise)
  // Insert metadata into the HTML stream through the `useServerInsertedMetadata`
  useServerInsertedMetadata(() => metadata)

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
