import type { PrerenderStoreModern } from './work-unit-async-storage.external'

/**
 * In a prerender, we may end up with hanging Promises as inputs due them
 * stalling on connection() or because they're loading dynamic data. In that
 * case we need to abort the encoding of arguments since they'll never complete.
 */
export function createHangingInputAbortSignal(
  workUnitStore: PrerenderStoreModern
): AbortSignal {
  const controller = new AbortController()

  if (workUnitStore.cacheSignal) {
    // If we have a cacheSignal it means we're in a prospective render. If the input
    // we're waiting on is coming from another cache, we do want to wait for it so that
    // we can resolve this cache entry too.
    workUnitStore.cacheSignal.inputReady().then(() => {
      controller.abort()
    })
  } else {
    // Otherwise we're in the final render and we should already have all our caches
    // filled. We might still be waiting on some microtasks so we wait one tick before
    // giving up. When we give up, we still want to render the content of this cache
    // as deeply as we can so that we can suspend as deeply as possible in the tree
    // or not at all if we don't end up waiting for the input.
    process.nextTick(() => controller.abort())
  }

  return controller.signal
}
