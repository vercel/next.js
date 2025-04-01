import { useContext } from 'react'
import { ServerInsertedMetadataContext } from '../../../shared/lib/server-inserted-metadata.shared-runtime'
import type { StreamingMetadataResolvedState } from './types'
import { InvariantError } from '../../../shared/lib/invariant-error'

export function ServerInsertMetadata({
  promise,
}: {
  promise: Promise<StreamingMetadataResolvedState>
}) {
  const setPendingMetadata = useContext(ServerInsertedMetadataContext)

  if (typeof setPendingMetadata !== 'function') {
    throw new InvariantError(
      'ServerInsertMetadata must be used within a ServerInsertedMetadataProvider but no context value was found.'
    )
  }

  // We create a wrapper promise because React promises through flight don't actually
  // implement the promise API where new promises are returned from then calls
  const metadataPromise = new Promise<React.ReactNode>((resolve, reject) => {
    promise.then(
      (result) => {
        resolve(result.metadata)
      },
      (error) => {
        reject(error)
      }
    )
  })

  setPendingMetadata(metadataPromise)

  return null
}
