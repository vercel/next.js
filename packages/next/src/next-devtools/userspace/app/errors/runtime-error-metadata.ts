import type { RuntimeErrorMetadata } from '../../../../server/dev/hot-reloader-types'

const pendingMetadata = new WeakMap<Error, RuntimeErrorMetadata>()

// Used only for the synchronous reportError -> window.error handoff.
export function setRuntimeErrorMetadata(
  error: Error,
  metadata: RuntimeErrorMetadata
) {
  pendingMetadata.set(error, metadata)
}

export function takeRuntimeErrorMetadata(error: Error) {
  const metadata = pendingMetadata.get(error)
  pendingMetadata.delete(error)
  return metadata
}
