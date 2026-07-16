/**
 * Inert stand-in for `./navigation-testing-lock`.
 *
 * When the Instant Navigation Testing API is disabled (a production build
 * without `experimental.exposeTestingApiInProductionBuild`), the browser
 * bundle resolves `./navigation-testing-lock` to this module instead of the
 * real implementation, so none of the lock machinery ships. The alias is set
 * up in `create-compiler-aliases.ts` (webpack) and
 * `crates/next-core/src/next_import_map.rs` (Turbopack).
 *
 * Every export mirrors the real module's signature and returns the value the
 * real implementation produces when no lock is held.
 */

import type { FlightRouterState } from '../../../shared/lib/app-router-types'
import type { PendingSegmentCacheEntry, SegmentCacheEntry } from './cache'
import type { FetchStrategy } from './types'
import type {
  NavigationLockPrefetch,
  NavigationLockState,
} from './navigation-testing-lock'

export type {
  NavigationLockPrefetch,
  NavigationLockState,
} from './navigation-testing-lock'

export function getPreLockFetch(): typeof fetch | null {
  return null
}

export function beginNavigationLockPrefetch(): NavigationLockPrefetch | null {
  return null
}

export function recordNavigationLockOwnedEntry(
  _entry: SegmentCacheEntry
): void {}

export function trackNavigationLockPrefetchEntry(
  _prefetch: NavigationLockPrefetch,
  _entry: PendingSegmentCacheEntry
): void {}

export function finishNavigationLockPrefetchSpawning(
  _prefetch: NavigationLockPrefetch
): void {}

export function startListeningForInstantNavigationCookie(): void {}

export function updateCapturedSPAToTree(
  _fromTree: FlightRouterState,
  _toTree: FlightRouterState
): void {}

export function isNavigationLocked(): boolean {
  return false
}

export function getCurrentNavigationLock(): NavigationLockState | null {
  return null
}

export function shouldRestrictNavigationToShell(
  _rootPrefetchHints: number,
  _linkFetchStrategy: FetchStrategy
): boolean {
  return false
}

export async function waitForNavigationLockIfActive(
  _lock: NavigationLockState | null = null
): Promise<void> {}
