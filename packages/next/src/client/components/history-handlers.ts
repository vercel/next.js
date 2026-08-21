import type { AppHistoryState } from './router-reducer/router-reducer-types'
import { restore, traverse } from './navigator'

// The inline script in server/app-render/history-bootstrap.ts runs with the
// shell, long before the Router effect below installs the history handlers.
// It marks the entry the document was activated on and records whether
// history changed in between.
const ACTIVATION_MARKER = '__PRIVATE_NEXTJS_INTERNALS_HISTORY_ACTIVATION'

type EarlyHistory = {
  // The URL the document was activated on.
  href: string
  // Whether any pushState, replaceState or popstate happened since.
  changed: boolean
}

// The script's pushState/replaceState wrappers keep the method they replaced.
type EarlyHistoryWrapper<T> = T & { __original?: T }

declare global {
  interface Window {
    __next_h?: EarlyHistory
  }
}

type HistoryEntry =
  // Written by the App Router, possibly in an earlier document.
  | { kind: 'app'; historyState: AppHistoryState | undefined }
  // The activation entry, or an entry written from it before the router took
  // over. Both render with the initial payload.
  | { kind: 'activation' }
  | { kind: 'unknown' }

let activationHistoryState: AppHistoryState | undefined

function readHistoryEntry(state: unknown): HistoryEntry {
  if (state === null || typeof state !== 'object') {
    return { kind: 'unknown' }
  }
  const historyState = state as Record<string, unknown>
  if (historyState.__NA === true) {
    return {
      kind: 'app',
      historyState: historyState.__PRIVATE_NEXTJS_INTERNALS_TREE as
        | AppHistoryState
        | undefined,
    }
  }
  if (historyState[ACTIVATION_MARKER] === true) {
    return { kind: 'activation' }
  }
  return { kind: 'unknown' }
}

export function initializeEarlyHistory(historyState: AppHistoryState): void {
  activationHistoryState = historyState
}

// A Back/Forward press before the router's popstate listener exists moves the
// browser to a different history entry than the one the document was activated
// on, and the resulting popstate fires with nobody listening. The bootstrap
// script recorded it, so until the listener is installed a recorded change
// onto an entry the router can render means a traversal went unobserved.
function hasMissedTraversal(): boolean {
  return (
    window.__next_h?.changed === true &&
    // On any other entry the traversal is left unhandled, as before.
    readHistoryEntry(window.history.state).kind !== 'unknown'
  )
}

let checkedMissedTraversalBeforeHistoryWrite = false

export function shouldSkipFirstHistoryWrite(): boolean {
  if (checkedMissedTraversalBeforeHistoryWrite) {
    return false
  }
  checkedMissedTraversalBeforeHistoryWrite = true
  return hasMissedTraversal()
}

export function writeHistory(
  method: 'pushState' | 'replaceState',
  historyState: Record<string, unknown>,
  url: string
): void {
  // The first write on the activation entry inherits its marker through
  // preserveCustomHistoryState. The entry is the router's from here on.
  delete historyState[ACTIVATION_MARKER]
  window.history[method](historyState, '', url)
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

  const historyEntry = readHistoryEntry(state)
  // This case happens when the history entry was pushed by the `pages` router.
  if (historyEntry.kind === 'unknown') {
    window.location.reload()
    return
  }

  traverse(
    window.location.href,
    historyEntry.kind === 'app'
      ? historyEntry.historyState
      : activationHistoryState
  )
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
  const missedTraversal = hasMissedTraversal()

  // Remove the bootstrap script's wrappers, unless application code wrapped
  // them in turn.
  const pushStateWrapper: EarlyHistoryWrapper<History['pushState']> =
    window.history.pushState
  if (pushStateWrapper.__original !== undefined) {
    window.history.pushState = pushStateWrapper.__original
  }
  const replaceStateWrapper: EarlyHistoryWrapper<History['replaceState']> =
    window.history.replaceState
  if (replaceStateWrapper.__original !== undefined) {
    window.history.replaceState = replaceStateWrapper.__original
  }
  delete window.__next_h

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

  if (missedTraversal) {
    handlePopState(window.history.state)
  }

  return () => {
    window.history.pushState = originalPushState
    window.history.replaceState = originalReplaceState
    window.removeEventListener('popstate', onPopState)
  }
}
