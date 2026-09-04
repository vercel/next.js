import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'

/**
 * Returns an `AbortSignal` for the current request that is aborted when the
 * client disconnects — for example, when a Server Action call is cancelled via
 * an `AbortController`, or the user navigates away before it completes.
 *
 * Use it to cancel long-running work (e.g. forward it to `fetch`) and free
 * server resources instead of running to completion after the client is gone.
 *
 * Outside of a request (e.g. during prerendering, or in a "use cache" scope) it
 * returns a signal that never aborts, so it is always safe to call.
 */
export function unstable_requestSignal(): AbortSignal {
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'request':
        if (workUnitStore.signal) {
          return workUnitStore.signal
        }
        break
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
      case 'prerender':
      case 'prerender-client':
      case 'validation-client':
      case 'prerender-runtime':
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'generate-static-params':
        break
      default:
        workUnitStore satisfies never
    }
  }

  // No request-scoped signal is available (e.g. prerendering). Return a signal
  // that never aborts so callers can use it unconditionally.
  return new AbortController().signal
}
