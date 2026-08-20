import type { AppHistoryState } from './router-reducer/router-reducer-types'
import { restore, traverse } from './navigator'

// A Back/Forward press before the router's popstate listener exists moves the
// browser to a different history entry than the one the document was activated
// on, and the resulting popstate fires with nobody listening. The activation
// entry is fixed for the document's lifetime and entry keys are stable across
// replaceState, so until the listener is installed a key mismatch means a
// traversal went unobserved.
function hasMissedTraversal(): boolean {
  if (typeof window.navigation === 'undefined') {
    return false
  }
  const activationEntry = window.navigation.activation?.entry
  const currentEntry = window.navigation.currentEntry
  return (
    activationEntry != null &&
    currentEntry != null &&
    activationEntry.key !== currentEntry.key &&
    // Only entries written by the app router can be restored; on any other
    // entry the traversal is left unhandled, as before.
    window.history.state?.__NA === true
  )
}

let checkedMissedTraversalBeforeHistoryWrite = false
let checkedMissedTraversalBeforeReplay = false

export function shouldSkipFirstHistoryWrite(): boolean {
  if (checkedMissedTraversalBeforeHistoryWrite) {
    return false
  }
  checkedMissedTraversalBeforeHistoryWrite = true
  return hasMissedTraversal()
}

/**
 * Handles a popstate event (or one that was missed before hydration).
 * By default dispatches ACTION_RESTORE, however if the history entry was not
 * pushed/replaced by app-router it will reload the page.
 * That case can happen when the old router injected the history entry.
 */
function handlePopState(state: PopStateEvent['state']): void {
  if (!state) {
    // TODO-APP: this case only happens when pushState/replaceState was called outside of Next.js. It should probably reload the page in this case.
    return
  }

  // This case happens when the history entry was pushed by the `pages` router.
  if (!state.__NA) {
    window.location.reload()
    return
  }

  traverse(window.location.href, state.__PRIVATE_NEXTJS_INTERNALS_TREE)
}

function copyNextJsInternalHistoryState(data: any) {
  if (data == null) data = {}
  const currentState = window.history.state
  const __NA = currentState?.__NA
  if (__NA) {
    data.__NA = __NA
  }
  const __PRIVATE_NEXTJS_INTERNALS_TREE =
    currentState?.__PRIVATE_NEXTJS_INTERNALS_TREE
  if (__PRIVATE_NEXTJS_INTERNALS_TREE) {
    data.__PRIVATE_NEXTJS_INTERNALS_TREE = __PRIVATE_NEXTJS_INTERNALS_TREE
  }

  return data
}

export function installHistoryHandlers(): () => void {
  const originalPushState = window.history.pushState.bind(window.history)
  const originalReplaceState = window.history.replaceState.bind(window.history)

  // Ensure the canonical URL in the Next.js Router is updated when the URL is changed so that `usePathname` and `useSearchParams` hold the pushed values.
  const applyUrlFromHistoryPushReplace = (
    url: string | URL | null | undefined
  ) => {
    const href = window.location.href
    const appHistoryState: AppHistoryState | undefined =
      window.history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE

    restore(new URL(url ?? href, href), appHistoryState)
  }

  /**
   * Patch pushState to ensure external changes to the history are reflected in the Next.js Router.
   * Ensures Next.js internal history state is copied to the new history entry.
   * Ensures usePathname and useSearchParams hold the newly provided url.
   */
  window.history.pushState = function pushState(
    data: any,
    _unused: string,
    url?: string | URL | null
  ): void {
    // TODO: Warn when Navigation API is available (navigation.navigate() should be used)
    // Avoid a loop when Next.js internals trigger pushState/replaceState
    if (data?.__NA || data?._N) {
      return originalPushState(data, _unused, url)
    }

    data = copyNextJsInternalHistoryState(data)

    if (url) {
      applyUrlFromHistoryPushReplace(url)
    }

    return originalPushState(data, _unused, url)
  }

  /**
   * Patch replaceState to ensure external changes to the history are reflected in the Next.js Router.
   * Ensures Next.js internal history state is copied to the new history entry.
   * Ensures usePathname and useSearchParams hold the newly provided url.
   */
  window.history.replaceState = function replaceState(
    data: any,
    _unused: string,
    url?: string | URL | null
  ): void {
    // TODO: Warn when Navigation API is available (navigation.navigate() should be used)
    // Avoid a loop when Next.js internals trigger pushState/replaceState
    if (data?.__NA || data?._N) {
      return originalReplaceState(data, _unused, url)
    }
    data = copyNextJsInternalHistoryState(data)

    if (url) {
      applyUrlFromHistoryPushReplace(url)
    }
    return originalReplaceState(data, _unused, url)
  }

  const onPopState = (event: PopStateEvent) => handlePopState(event.state)

  window.addEventListener('popstate', onPopState)

  if (!checkedMissedTraversalBeforeReplay) {
    checkedMissedTraversalBeforeReplay = true
    if (hasMissedTraversal()) {
      handlePopState(window.history.state)
    }
  }

  return () => {
    window.history.pushState = originalPushState
    window.history.replaceState = originalReplaceState
    window.removeEventListener('popstate', onPopState)
  }
}
