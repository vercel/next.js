/**
 * Navigation lock for the Instant Navigation Testing API.
 *
 * Manages the in-memory lock (a promise) that gates dynamic data writes
 * during instant navigation captures, and owns all cookie state
 * transitions (pending → captured-MPA, pending → captured-SPA).
 *
 * External actors (Playwright, devtools) set [0] to start a lock scope
 * and delete the cookie to end one. Next.js writes captured values.
 * The CookieStore handler distinguishes them by value: pending = external,
 * captured = self-write (ignored).
 *
 * This module assumes the Instant Navigation Testing API is enabled. When it
 * is disabled, the bundler resolves this module to
 * `./navigation-testing-lock.disabled` instead (see
 * `create-compiler-aliases.ts` for webpack and
 * `crates/next-core/src/next_import_map.rs` for Turbopack), so none of this
 * code ships in the browser bundle.
 */

import {
  PrefetchHint,
  type FlightRouterState,
  type InstantCookie,
} from '../../../shared/lib/app-router-types'
import { NEXT_INSTANT_TEST_COOKIE } from '../app-router-headers'
import { refreshOnInstantNavigationUnlock } from '../use-action-queue'
import { subtreeHasSpeculativePrefetch } from './scheduler'
import {
  waitForSegmentCacheEntry,
  type PendingSegmentCacheEntry,
  type SegmentCacheEntry,
} from './cache'
import type { FetchStrategy } from './types'

type InstantNavCookieState = 'empty' | 'pending' | 'mpa' | 'spa'

function parseCookieValue(raw: string): InstantNavCookieState {
  if (raw === '') {
    return 'empty'
  }
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      if (parsed.length >= 3) {
        const rawState = parsed[2]
        return rawState === null ? 'mpa' : 'spa'
      }
    }
  } catch {}
  return 'pending'
}

function writeDocumentCookie(
  value: InstantCookie,
  options: { domain?: string | null; path?: string | null }
): void {
  if (typeof document === 'undefined') {
    return
  }
  let cookie = `${NEXT_INSTANT_TEST_COOKIE}=${JSON.stringify(value)}; Path=${
    options.path ?? '/'
  }`
  if (options.domain) {
    cookie += `; Domain=${options.domain}`
  }
  document.cookie = cookie
}

function writeCookieValue(value: InstantCookie): void {
  if (typeof cookieStore === 'undefined') {
    return
  }
  // Read the existing cookie to preserve its attributes (domain, path), then
  // write back with the new value. This updates the same cookie entry that the
  // external actor created, regardless of how it was scoped. The read goes
  // through `cookieStore.get` because `document.cookie` exposes only names and
  // values, not the domain/path we need to preserve. The write goes through
  // document.cookie because WebKit exposes Cookie Store on localhost but does
  // not commit cookies written through cookieStore.set() there.
  //
  // Capture the current lockState and compare it in the callback so we only
  // write if the lock we observed at call time is still held. This guards
  // against two races: (a) the scope ended between get and set (lockState is
  // now null), and (b) the scope ended and a new one was acquired in the same
  // gap (lockState is a different object). In either case we must not write —
  // doing so would leak stale state into the next scope or outlive the current
  // one. It cannot close one window, though: the callback can run after an
  // external delete but before the deleted-event handler nulls lockState, so
  // the guard still passes and we resurrect the cookie. The deleted handler
  // clears any such entry once the lock is released (see the `event.deleted`
  // loop below).
  const lockAtCall = lockState
  cookieStore.get(NEXT_INSTANT_TEST_COOKIE).then((existing: any) => {
    if (existing && lockState === lockAtCall && lockAtCall !== null) {
      writeDocumentCookie(value, existing)
    }
  })
}

/**
 * The "wait for the locked navigation's prefetch to fulfill" state for a single
 * locked navigation. `promise` resolves once that prefetch has spawned every
 * request and all of them have fulfilled, so the navigation reads present data
 * rather than a still-in-flight entry. Owned by the prefetch task (one per
 * navigation, so successive navigations in a scope resolve independently) and
 * also tracked in `NavigationLockState.activePrefetches` so the lock can
 * force-resolve any that are still pending when it's released.
 *
 * `pendingCount` holds one reference for the scheduler while it is still
 * spawning, plus one per in-flight entry; `promise` resolves when it drains to
 * 0. `trackedEntries` dedupes entry registration.
 */
export type NavigationLockPrefetch = {
  promise: Promise<void>
  resolve: () => void
  pendingCount: number
  trackedEntries: Set<PendingSegmentCacheEntry>
}

export type NavigationLockState = {
  // Resolves when the lock is released (the testing scope ends). Out-of-band
  // user fetches blocked by `globalFetchOverride` wait on this so they dispatch
  // only once the scope ends. (A locked navigation's *withheld dynamic write*
  // waits on `currentNavigation` instead — see below.)
  released: Promise<void>
  resolveReleased: () => void
  // The pre-lock `window.fetch`, captured at `acquireLock` time and
  // restored at `releaseLock`. Internal Next.js code reads this via
  // `getPreLockFetch` to bypass the override we install on `window.fetch`
  // during a lock scope.
  fetch: typeof fetch
  // Every prefetch-completion state for this scope that hasn't resolved yet.
  // A prefetch removes itself when it drains; on release, any still here are
  // force-resolved so no navigation hangs waiting on a prefetch that the scope
  // ended before it could finish.
  activePrefetches: Set<NavigationLockPrefetch>
  // Every segment entry that was (re)fetched within this lock scope. Navigation
  // reads are restricted to these, so each instant() navigation observes only
  // data fetched under the lock — a "clean read" — and never matches a stale
  // entry left in the cache by an earlier navigation or prefetch. See
  // `readSegmentCacheEntryForNavigation`.
  ownedEntries: Set<SegmentCacheEntry>
  // The withheld-data gate for the current locked navigation. A locked
  // navigation's dynamic write waits on this rather than on the scope-wide
  // `released`. Each navigation captures the promise when it begins (via
  // `beginLockedNavigation` or `getCurrentNavigationGate`) and awaits that
  // immutable snapshot, never this mutable field. `beginLockedNavigation`
  // rolls the field over on each new locked navigation: it resolves the
  // current promise — so the *previous* navigation's withheld data is written
  // out and the cache nodes it produced stop holding pending deferred promises
  // that a reused shared segment would otherwise suspend on — then installs a
  // fresh one. `releaseLock` resolves it too. Net effect: only the most recent
  // navigation's data stays withheld; a new navigation always releases the
  // previous one.
  currentNavigation: Promise<void>
  resolveCurrentNavigation: () => void
}

let lockState: NavigationLockState | null = null

export function getPreLockFetch(): typeof fetch | null {
  return lockState !== null ? lockState.fetch : null
}

/**
 * Creates the "wait for prefetch to fulfill" state for one locked navigation,
 * registers it on the current lock, and returns it (the caller stores it on the
 * prefetch task and awaits `.promise`). Returns null if no lock is held.
 *
 * `pendingCount` starts at 1, representing the scheduler itself while it is
 * still spawning requests; that reference is released by
 * `finishNavigationLockPrefetchSpawning`. Each spawned pending entry adds
 * another (see `trackNavigationLockPrefetchEntry`). `promise` resolves when the
 * count drains to 0 — i.e. spawning finished and every entry fulfilled.
 */
export function beginNavigationLockPrefetch(): NavigationLockPrefetch | null {
  if (lockState !== null) {
    let resolve: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    const prefetch: NavigationLockPrefetch = {
      promise,
      resolve: resolve!,
      pendingCount: 1,
      trackedEntries: new Set(),
    }
    lockState.activePrefetches.add(prefetch)
    return prefetch
  }
  return null
}

/**
 * Records a freshly-created segment entry as owned by the current lock scope, so
 * navigation reads will match it — and only entries created within the scope
 * (see `NavigationLockState.ownedEntries`). Called from
 * `createDetachedSegmentCacheEntry`, the single factory every creation path
 * funnels through, so re-keyed entries created during response processing (e.g.
 * a runtime prefetch resolving a concrete param) are owned too. No-op when no
 * lock is held.
 */
export function recordNavigationLockOwnedEntry(entry: SegmentCacheEntry): void {
  if (lockState !== null) {
    lockState.ownedEntries.add(entry)
  }
}

/**
 * Called by `upgradeToPendingSegment` whenever the locked-navigation prefetch
 * spawns a pending segment entry. Adds the entry to the prefetch's ref count and
 * decrements when it fulfills (or rejects — `waitForSegmentCacheEntry` resolves
 * to null). Deduped so the same entry never double-counts.
 */
export function trackNavigationLockPrefetchEntry(
  prefetch: NavigationLockPrefetch,
  entry: PendingSegmentCacheEntry
): void {
  if (prefetch.trackedEntries.has(entry)) {
    return
  }
  prefetch.trackedEntries.add(entry)
  prefetch.pendingCount++
  const onSettled = () => {
    prefetch.pendingCount--
    settleNavigationLockPrefetchIfDrained(prefetch)
  }
  // Decrement whether the entry fulfills or its request rejects, so a failed
  // segment can't leave the navigation waiting forever.
  waitForSegmentCacheEntry(entry).then(onSettled, onSettled)
}

/**
 * Called once the scheduler has finished spawning every request for the
 * locked-navigation prefetch, releasing the scheduler's reference from the ref
 * count. The prefetch resolves here if every spawned entry already fulfilled.
 */
export function finishNavigationLockPrefetchSpawning(
  prefetch: NavigationLockPrefetch
): void {
  prefetch.pendingCount--
  settleNavigationLockPrefetchIfDrained(prefetch)
}

function settleNavigationLockPrefetchIfDrained(
  prefetch: NavigationLockPrefetch
): void {
  if (prefetch.pendingCount === 0) {
    // Unregister from the lock (if still held) and resolve. Resolving is
    // idempotent, so it's safe even if the lock already force-resolved this on
    // release.
    if (lockState !== null) {
      lockState.activePrefetches.delete(prefetch)
    }
    prefetch.resolve()
  }
}

function acquireLock(): void {
  if (lockState !== null) {
    return
  }
  let resolveReleased: () => void
  const released = new Promise<void>((r) => {
    resolveReleased = r
  })
  let resolveCurrentNavigation: () => void
  const currentNavigation = new Promise<void>((r) => {
    resolveCurrentNavigation = r
  })
  lockState = {
    released,
    resolveReleased: resolveReleased!,
    fetch: window.fetch,
    activePrefetches: new Set(),
    ownedEntries: new Set(),
    currentNavigation,
    resolveCurrentNavigation: resolveCurrentNavigation!,
  }

  // Install the fetch blocker. We only intercept `window.fetch` for the
  // duration of the lock so that — outside of a testing scope — user-
  // installed overrides of `window.fetch` are untouched.
  window.fetch = globalFetchOverride
}

function releaseLock(): void {
  if (lockState === null) {
    return
  }
  // Restore the pre-lock `window.fetch` before resolving the lock promise
  // so any fetches queued on the promise see the restored fetch.
  window.fetch = lockState.fetch
  const { resolveReleased, activePrefetches, resolveCurrentNavigation } =
    lockState
  lockState = null
  // Force-resolve every prefetch that hasn't finished, so a navigation still
  // waiting on one doesn't hang now that the scope is ending.
  for (const prefetch of activePrefetches) {
    prefetch.resolve()
  }
  // Resolve the current locked navigation's withheld-data gate, so its gated
  // dynamic write unblocks now that the scope is ending.
  resolveCurrentNavigation()
  // Resolve the release promise so blocked out-of-band fetches dispatch too.
  resolveReleased()
}

/**
 * Called when a new locked navigation begins (from `navigate` while the lock is
 * held). Rolls over the lock's withheld-data gate: it resolves the current
 * `currentNavigation` promise — so the *previous* locked navigation's withheld
 * dynamic write proceeds and the cache nodes it produced stop holding pending
 * deferred `rsc` promises that a reused shared segment in this navigation would
 * otherwise suspend on — then installs a fresh promise for this navigation.
 * Only the most recent navigation's data stays withheld; a new navigation
 * always releases the previous one. Returns this navigation's gate — the
 * immutable promise its dynamic write awaits — or null when no lock is held.
 *
 * This is the testing-lock behavior for repeated navigations while paused. It
 * is not a principled fix for the underlying `useDeferredValue`/reuse-suspend
 * behavior; it just ensures that, under the lock, a reused segment never
 * carries a still-pending deferred `rsc` from an earlier navigation.
 */
export function beginLockedNavigation(): Promise<void> | null {
  if (lockState === null) {
    return null
  }
  // Release the previous locked navigation's withheld data, then roll over to a
  // fresh gate for this navigation — all without ending the scope.
  lockState.resolveCurrentNavigation()
  let resolveCurrentNavigation: () => void
  const currentNavigation = new Promise<void>((r) => {
    resolveCurrentNavigation = r
  })
  lockState.currentNavigation = currentNavigation
  lockState.resolveCurrentNavigation = resolveCurrentNavigation!
  return currentNavigation
}

/**
 * Global fetch override
 *
 * While the navigation lock is active, we install this as `window.fetch` so
 * out-of-band client-side fetches (e.g. `fetch('/api/data')` inside a
 * useEffect) are blocked until the lock is released. Next.js internals
 * bypass the override by importing `fetch` from `./fetch`, which reads the
 * captured pre-lock fetch via `getPreLockFetch`.
 *
 * NOTE: This override only affects environments where the Instant Navigation
 * Testing API is enabled. It has no impact on live production behavior.
 */
function globalFetchOverride(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  if (lockState === null) {
    // Lock is not active. Fall through to the global fetch — we reach this
    // only if a caller captured a reference to this function during a lock
    // scope and invoked it after release.
    return fetch(input, init)
  }
  // Block user-initiated fetches until the lock is released, then dispatch
  // through the fetch captured at acquire time. Reading from `lockState`
  // (rather than `window.fetch`) pins to the capture even if `window.fetch`
  // is reassigned after release.
  const currentLock = lockState
  return currentLock.released.then(() => {
    const preLockFetch = currentLock.fetch
    return preLockFetch(input, init)
  })
}

/**
 * Sets up the cookie-based lock. Handles the initial page load state and
 * registers a CookieStore listener for runtime changes.
 *
 * Called once during page initialization from app-globals.ts.
 */
export function startListeningForInstantNavigationCookie(): void {
  // If the server served a shell, this is an MPA page load
  // while the lock is held. Transition to captured-MPA and acquire.
  if (self.__next_instant_test) {
    if (typeof cookieStore !== 'undefined') {
      // If the cookie was already cleared during the MPA page
      // transition, reload to get the full dynamic page.
      cookieStore.get(NEXT_INSTANT_TEST_COOKIE).then((cookie: any) => {
        if (!cookie) {
          window.location.reload()
        }
      })
    }

    // Acquire the lock before writing the cookie. writeCookieValue's
    // guard requires lockState to be non-null at call time (so a stale
    // write can't outlive its scope). On a fresh page load that scope
    // is the one we're about to establish, so we have to establish it
    // first.
    acquireLock()
    writeCookieValue([1, `c${Math.random()}`, null])
  }

  if (typeof cookieStore === 'undefined') {
    return
  }

  cookieStore.addEventListener('change', (event: CookieChangeEvent) => {
    for (const cookie of event.changed) {
      if (cookie.name === NEXT_INSTANT_TEST_COOKIE) {
        const state = parseCookieValue(cookie.value ?? '')

        if (state === 'pending') {
          // External actor starting a new lock scope.
          if (lockState !== null) {
            // This can be the delayed CookieStore event for the pending
            // cookie that was already observed synchronously from
            // document.cookie. Keep the existing lock identity so work that
            // captured it keeps waiting on the same promise.
            return
          }
          acquireLock()
        }
        // Captured value (our own transition) or empty. Ignore.
        return
      }
    }

    for (const cookie of event.deleted) {
      if (cookie.name === NEXT_INSTANT_TEST_COOKIE) {
        if (lockState === null) {
          // Either no lock is active, or this is the re-entrant change event
          // from the defensive clear below (which runs after releaseLock).
          // Nothing to release either way.
          return
        }
        releaseLock()
        // A captured write from this page's bootstrap can resurrect the
        // cookie in the narrow gap between the external delete and this
        // handler: writeCookieValue's guard only rejects the write once the
        // lock is torn down, which happens here. Now that the lock is
        // released, no further captured write can re-add the cookie, so clear
        // any entry that was resurrected in that gap. Otherwise an unlock
        // that falls back to a hard reload (when the shell has not yet
        // hydrated) would carry the stale cookie, be served the shell again,
        // and re-enter instant mode with no scope left to release it.
        if (typeof document !== 'undefined') {
          document.cookie = `${NEXT_INSTANT_TEST_COOKIE}=; Path=/; Max-Age=0`
        }
        refreshOnInstantNavigationUnlock()
        return
      }
    }
  })
}

/**
 * Transitions the cookie from pending to captured-SPA once the prefetch resolves
 * and the navigation is known to be an SPA.
 */
export function updateCapturedSPAToTree(
  fromTree: FlightRouterState,
  toTree: FlightRouterState
): void {
  writeCookieValue([1, `c${Math.random()}`, { from: fromTree, to: toTree }])
}

/**
 * Returns true if the navigation lock is currently active.
 */
export function isNavigationLocked(): boolean {
  if (lockState !== null) {
    return true
  }

  // If `lockState` is null, fall back to reading the test cookie
  // synchronously from `document.cookie`. This accounts for a small race
  // between `cookieStore.set(...)` and its corresponding `change` event.
  // During that gap `lockState` is still null even though the cookie
  // indicates a new lock scope is starting.
  if (typeof document === 'undefined') {
    return false
  }
  const allCookies = document.cookie
  if (!allCookies.includes(NEXT_INSTANT_TEST_COOKIE)) {
    // Fast bail-out: in almost every navigation the test cookie is not
    // set at all.
    return false
  }
  const target = NEXT_INSTANT_TEST_COOKIE + '='
  for (const segment of allCookies.split(';')) {
    const trimmed = segment.trim()
    if (
      trimmed.startsWith(target) &&
      parseCookieValue(trimmed.slice(target.length)) === 'pending'
    ) {
      // The cookie was set by an external actor but the change event was not
      // yet dispatched. Acquire the lock synchronously.
      acquireLock()
      return true
    }
  }
  return false
}

export function getCurrentNavigationLock(): NavigationLockState | null {
  return lockState
}

/**
 * Returns the current locked navigation's withheld-data gate — the same
 * immutable promise `beginLockedNavigation` handed that navigation — or null
 * when no lock is held. For router work that spawns a dynamic write without
 * beginning a navigation of its own (refreshes, server actions, server
 * patches): it gates behind the navigation that is current when it spawns, so
 * the next locked navigation (or unlock) releases it.
 */
export function getCurrentNavigationGate(): Promise<void> | null {
  return lockState !== null ? lockState.currentNavigation : null
}

/**
 * Decides whether segment reads during a navigation should be restricted to
 * shell entries (every param substituted with Fallback) rather than matching
 * entries that vary on concrete route params.
 *
 * The testing tools (Navigation Inspector, instant()) simulate what a user
 * would see with a warm cache. When the lock is held, partial prefetching is
 * enabled for the target route, and no whole-route ("speculative") prefetch
 * would have been made, only the shell is prefetched — so that's all a
 * navigation should be allowed to match. A speculative prefetch happens for a
 * `<Link prefetch={true}>` or an eagerly-prefetched subtree, in which case the
 * concrete-param entry is genuinely warm and may be matched.
 *
 * Always returns false outside the testing API, via the aliased
 * `navigation-testing-lock.disabled` module.
 */
export function shouldRestrictNavigationToShell(
  rootPrefetchHints: number,
  linkFetchStrategy: FetchStrategy
): boolean {
  return (
    isNavigationLocked() &&
    (rootPrefetchHints & PrefetchHint.SubtreeHasPartialPrefetching) !== 0 &&
    !subtreeHasSpeculativePrefetch(linkFetchStrategy, rootPrefetchHints)
  )
}
