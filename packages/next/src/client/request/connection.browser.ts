import { createResolvedReactPromise } from '../../shared/lib/react-promise'

// Reusing a single instance avoids allocating on every call.
const resolvedConnectionPromise = createResolvedReactPromise(undefined)

/**
 * Browser implementation of connection(). On the client there is no
 * prerender context, so we always resolve immediately.
 */
export function connection(): Promise<void> {
  return resolvedConnectionPromise
}
