'use client'

import { Suspense, use } from 'react'
import { useServerInsertedMetadata } from '../../server/app-render/metadata-insertion/use-server-inserted-metadata'

export type StreamingMetadataResolvedState = {
  metadata: React.ReactNode
  error: unknown | null
  digest: string | undefined
}

function ServerInsertMetadata({
  promise,
}: {
  promise: Promise<StreamingMetadataResolvedState>
}) {
  // Apply use() to the metadata promise to suspend the rendering in SSR.
  const { metadata } = use(promise)
  // Insert metadata into the HTML stream through the `useServerInsertedMetadata`
  useServerInsertedMetadata(() => metadata)

  return null
}

function BrowserResolvedMetadata({
  promise,
}: {
  promise: Promise<StreamingMetadataResolvedState>
}) {
  const { metadata } = use(promise)
  return metadata
}

export function AsyncMetadata({
  promise,
}: {
  promise: Promise<StreamingMetadataResolvedState>
}) {
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
