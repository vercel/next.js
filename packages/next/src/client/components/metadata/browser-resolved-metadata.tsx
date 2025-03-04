import { use } from 'react'
import type { StreamingMetadataResolvedState } from './types'

export function BrowserResolvedMetadata({
  promise,
}: {
  promise: Promise<StreamingMetadataResolvedState>
}) {
  const { metadata, error } = use(promise)
  // If there's metadata error on client, discard the browser metadata
  // and let metadata outlet deal with the error. This will avoid the duplication metadata.
  if (error) return null
  return metadata
}
