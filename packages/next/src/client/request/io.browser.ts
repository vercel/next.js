import { createResolvedReactPromise } from '../../shared/lib/react-promise'

// Reusing a single instance avoids allocating on every call.
const resolvedIOPromise = createResolvedReactPromise(undefined)

/**
 * Browser implementation of io(). On the client there is no
 * prerender context so we always resolve immediately.
 */
export function io(): Promise<void> {
  return resolvedIOPromise
}
