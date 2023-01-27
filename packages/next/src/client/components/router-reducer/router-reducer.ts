import { CacheStates } from '../../../shared/lib/app-router-context'
import type { FlightSegmentPath } from '../../../server/app-render'
import { fetchServerResponse } from './fetch-server-response'
import { createRecordFromThenable } from './create-record-from-thenable'
import { readRecordValue } from './read-record-value'
import { createHrefFromUrl } from './create-href-from-url'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'
import { fillCacheWithNewSubTreeData } from './fill-cache-with-new-subtree-data'
import { invalidateCacheBelowFlightSegmentPath } from './invalidate-cache-below-flight-segmentpath'
import { fillCacheWithDataProperty } from './fill-cache-with-data-property'
import { createOptimisticTree } from './create-optimistic-tree'
import { applyRouterStatePatchToTree } from './apply-router-state-patch-to-tree'
import { shouldHardNavigate } from './should-hard-navigate'
import { isNavigatingToNewRootLayout } from './is-navigating-to-new-root-layout'
import {
  AppRouterState,
  RefreshAction,
  NavigateAction,
  RestoreAction,
  ServerPatchAction,
  PrefetchAction,
  ACTION_NAVIGATE,
  ACTION_SERVER_PATCH,
  ACTION_RESTORE,
  ACTION_REFRESH,
  ACTION_PREFETCH,
} from './router-reducer-types'

/**
 * Reducer that handles the app-router state updates.
 */
function clientReducer(
  state: Readonly<AppRouterState>,
  action: Readonly<
    | RefreshAction
    | NavigateAction
    | RestoreAction
    | ServerPatchAction
    | PrefetchAction
  >
): AppRouterState {
  switch (action.type) {
    case ACTION_NAVIGATE: {
      const { url, navigateType, cache, mutable, forceOptimisticNavigation } =
        action
      const { pathname, search } = url
      const href = createHrefFromUrl(url)
      const pendingPush = navigateType === 'push'

      const isForCurrentTree =
        JSON.stringify(mutable.previousTree) === JSON.stringify(state.tree)

      if (mutable.mpaNavigation && isForCurrentTree) {
        return {
          // Set href.
          canonicalUrl: mutable.canonicalUrlOverride
            ? mutable.canonicalUrlOverride
            : href,
          pushRef: {
            pendingPush,
            mpaNavigation: mutable.mpaNavigation,
          },
          // All navigation requires scroll and focus management to trigger.
          focusAndScrollRef: { apply: false },
          // Apply cache.
          cache: state.cache,
          prefetchCache: state.prefetchCache,
          // Apply patched router state.
          tree: state.tree,
        }
      }

      // Handle concurrent rendering / strict mode case where the cache and tree were already populated.
      if (mutable.patchedTree && isForCurrentTree) {
        return {
          // Set href.
          canonicalUrl: mutable.canonicalUrlOverride
            ? mutable.canonicalUrlOverride
            : href,
          pushRef: {
            pendingPush,
            mpaNavigation: false,
          },
          // All navigation requires scroll and focus management to trigger.
          focusAndScrollRef: { apply: true },
          // Apply cache.
          cache: mutable.useExistingCache ? state.cache : cache,
          prefetchCache: state.prefetchCache,
          // Apply patched router state.
          tree: mutable.patchedTree,
        }
      }

      const prefetchValues = state.prefetchCache.get(href)
      if (prefetchValues) {
        // The one before last item is the router state tree patch
        const {
          flightData,
          tree: newTree,
          canonicalUrlOverride,
        } = prefetchValues

        // Handle case when navigating to page in `pages` from `app`
        if (typeof flightData === 'string') {
          return {
            canonicalUrl: flightData,
            // Enable mpaNavigation
            pushRef: { pendingPush: true, mpaNavigation: true },
            // Don't apply scroll and focus management.
            focusAndScrollRef: { apply: false },
            cache: state.cache,
            prefetchCache: state.prefetchCache,
            tree: state.tree,
          }
        }

        if (newTree !== null) {
          mutable.previousTree = state.tree
          mutable.patchedTree = newTree
          mutable.mpaNavigation = isNavigatingToNewRootLayout(
            state.tree,
            newTree
          )

          if (newTree === null) {
            throw new Error('SEGMENT MISMATCH')
          }

          const canonicalUrlOverrideHrefVal = canonicalUrlOverride
            ? createHrefFromUrl(canonicalUrlOverride)
            : undefined
          if (canonicalUrlOverrideHrefVal) {
            mutable.canonicalUrlOverride = canonicalUrlOverrideHrefVal
          }
          mutable.mpaNavigation = isNavigatingToNewRootLayout(
            state.tree,
            newTree
          )

          // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
          const flightDataPath = flightData[0]
          const flightSegmentPath = flightDataPath.slice(
            0,
            -3
          ) as unknown as FlightSegmentPath
          // The one before last item is the router state tree patch
          const [treePatch, subTreeData, head] = flightDataPath.slice(-3)

          // Handles case where prefetch only returns the router tree patch without rendered components.
          if (subTreeData !== null) {
            if (flightDataPath.length === 3) {
              cache.status = CacheStates.READY
              cache.subTreeData = subTreeData
              cache.parallelRoutes = new Map()
              fillLazyItemsTillLeafWithHead(cache, state.cache, treePatch, head)
            } else {
              cache.status = CacheStates.READY
              // Copy subTreeData for the root node of the cache.
              cache.subTreeData = state.cache.subTreeData
              // Create a copy of the existing cache with the subTreeData applied.
              fillCacheWithNewSubTreeData(cache, state.cache, flightDataPath)
            }
          }

          const hardNavigate =
            // TODO-APP: Revisit if this is correct.
            search !== location.search ||
            shouldHardNavigate(
              // TODO-APP: remove ''
              ['', ...flightSegmentPath],
              state.tree
            )

          if (hardNavigate) {
            cache.status = CacheStates.READY
            // Copy subTreeData for the root node of the cache.
            cache.subTreeData = state.cache.subTreeData

            invalidateCacheBelowFlightSegmentPath(
              cache,
              state.cache,
              flightSegmentPath
            )
            // Ensure the existing cache value is used when the cache was not invalidated.
          } else if (subTreeData === null) {
            mutable.useExistingCache = true
          }

          const canonicalUrlOverrideHref = canonicalUrlOverride
            ? createHrefFromUrl(canonicalUrlOverride)
            : undefined

          if (canonicalUrlOverrideHref) {
            mutable.canonicalUrlOverride = canonicalUrlOverrideHref
          }

          return {
            // Set href.
            canonicalUrl: canonicalUrlOverrideHref
              ? canonicalUrlOverrideHref
              : href,
            // Set pendingPush.
            pushRef: { pendingPush, mpaNavigation: false },
            // All navigation requires scroll and focus management to trigger.
            focusAndScrollRef: { apply: true },
            // Apply patched cache.
            cache: mutable.useExistingCache ? state.cache : cache,
            prefetchCache: state.prefetchCache,
            // Apply patched tree.
            tree: newTree,
          }
        }
      }

      // When doing a hard push there can be two cases: with optimistic tree and without
      // The with optimistic tree case only happens when the layouts have a loading state (loading.js)
      // The without optimistic tree case happens when there is no loading state, in that case we suspend in this reducer

      // forceOptimisticNavigation is used for links that have `prefetch={false}`.
      if (forceOptimisticNavigation) {
        const segments = pathname.split('/')
        // TODO-APP: figure out something better for index pages
        segments.push('')

        // Optimistic tree case.
        // If the optimistic tree is deeper than the current state leave that deeper part out of the fetch
        const optimisticTree = createOptimisticTree(segments, state.tree, false)

        // Copy subTreeData for the root node of the cache.
        cache.status = CacheStates.READY
        cache.subTreeData = state.cache.subTreeData

        // Copy existing cache nodes as far as possible and fill in `data` property with the started data fetch.
        // The `data` property is used to suspend in layout-router during render if it hasn't resolved yet by the time it renders.
        const res = fillCacheWithDataProperty(
          cache,
          state.cache,
          // TODO-APP: segments.slice(1) strips '', we can get rid of '' altogether.
          segments.slice(1),
          () => fetchServerResponse(url, optimisticTree)
        )

        // If optimistic fetch couldn't happen it falls back to the non-optimistic case.
        if (!res?.bailOptimistic) {
          mutable.previousTree = state.tree
          mutable.patchedTree = optimisticTree
          mutable.mpaNavigation = isNavigatingToNewRootLayout(
            state.tree,
            optimisticTree
          )
          return {
            // Set href.
            canonicalUrl: href,
            // Set pendingPush.
            pushRef: { pendingPush, mpaNavigation: false },
            // All navigation requires scroll and focus management to trigger.
            focusAndScrollRef: { apply: true },
            // Apply patched cache.
            cache: cache,
            prefetchCache: state.prefetchCache,
            // Apply optimistic tree.
            tree: optimisticTree,
          }
        }
      }

      // Below is the not-optimistic case. Data is fetched at the root and suspended there without a suspense boundary.

      // If no in-flight fetch at the top, start it.
      if (!cache.data) {
        cache.data = createRecordFromThenable(
          fetchServerResponse(url, state.tree)
        )
      }

      // Unwrap cache data with `use` to suspend here (in the reducer) until the fetch resolves.
      const [flightData, canonicalUrlOverride] = readRecordValue(cache.data!)

      // Handle case when navigating to page in `pages` from `app`
      if (typeof flightData === 'string') {
        return {
          canonicalUrl: flightData,
          // Enable mpaNavigation
          pushRef: { pendingPush: true, mpaNavigation: true },
          // Don't apply scroll and focus management.
          focusAndScrollRef: { apply: false },
          cache: state.cache,
          prefetchCache: state.prefetchCache,
          tree: state.tree,
        }
      }

      // Remove cache.data as it has been resolved at this point.
      cache.data = null

      // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
      const flightDataPath = flightData[0]

      // The one before last item is the router state tree patch
      const [treePatch, subTreeData, head] = flightDataPath.slice(-3)

      // Path without the last segment, router state, and the subTreeData
      const flightSegmentPath = flightDataPath.slice(0, -4)

      // Create new tree based on the flightSegmentPath and router state patch
      const newTree = applyRouterStatePatchToTree(
        // TODO-APP: remove ''
        ['', ...flightSegmentPath],
        state.tree,
        treePatch
      )

      if (newTree === null) {
        throw new Error('SEGMENT MISMATCH')
      }

      const canonicalUrlOverrideHref = canonicalUrlOverride
        ? createHrefFromUrl(canonicalUrlOverride)
        : undefined
      if (canonicalUrlOverrideHref) {
        mutable.canonicalUrlOverride = canonicalUrlOverrideHref
      }
      mutable.previousTree = state.tree
      mutable.patchedTree = newTree
      mutable.mpaNavigation = isNavigatingToNewRootLayout(state.tree, newTree)

      if (flightDataPath.length === 3) {
        cache.status = CacheStates.READY
        cache.subTreeData = subTreeData
        fillLazyItemsTillLeafWithHead(cache, state.cache, treePatch, head)
      } else {
        // Copy subTreeData for the root node of the cache.
        cache.status = CacheStates.READY
        cache.subTreeData = state.cache.subTreeData
        // Create a copy of the existing cache with the subTreeData applied.
        fillCacheWithNewSubTreeData(cache, state.cache, flightDataPath)
      }

      return {
        // Set href.
        canonicalUrl: canonicalUrlOverrideHref
          ? canonicalUrlOverrideHref
          : href,
        // Set pendingPush.
        pushRef: { pendingPush, mpaNavigation: false },
        // All navigation requires scroll and focus management to trigger.
        focusAndScrollRef: { apply: true },
        // Apply patched cache.
        cache: cache,
        prefetchCache: state.prefetchCache,
        // Apply patched tree.
        tree: newTree,
      }
    }
    case ACTION_SERVER_PATCH: {
      const { flightData, previousTree, overrideCanonicalUrl, cache, mutable } =
        action

      // When a fetch is slow to resolve it could be that you navigated away while the request was happening or before the reducer runs.
      // In that case opt-out of applying the patch given that the data could be stale.
      if (JSON.stringify(previousTree) !== JSON.stringify(state.tree)) {
        // TODO-APP: Handle tree mismatch
        console.log('TREE MISMATCH')
        // Keep everything as-is.
        return state
      }

      if (mutable.mpaNavigation) {
        return {
          // Set href.
          canonicalUrl: mutable.canonicalUrlOverride
            ? mutable.canonicalUrlOverride
            : state.canonicalUrl,
          // TODO-APP: verify mpaNavigation not being set is correct here.
          pushRef: {
            pendingPush: true,
            mpaNavigation: mutable.mpaNavigation,
          },
          // All navigation requires scroll and focus management to trigger.
          focusAndScrollRef: { apply: false },
          // Apply cache.
          cache: state.cache,
          prefetchCache: state.prefetchCache,
          // Apply patched router state.
          tree: state.tree,
        }
      }

      // Handle concurrent rendering / strict mode case where the cache and tree were already populated.
      if (mutable.patchedTree) {
        return {
          // Keep href as it was set during navigate / restore
          canonicalUrl: mutable.canonicalUrlOverride
            ? mutable.canonicalUrlOverride
            : state.canonicalUrl,
          // Keep pushRef as server-patch only causes cache/tree update.
          pushRef: state.pushRef,
          // Keep focusAndScrollRef as server-patch only causes cache/tree update.
          focusAndScrollRef: state.focusAndScrollRef,
          // Apply patched router state
          tree: mutable.patchedTree,
          prefetchCache: state.prefetchCache,
          // Apply patched cache
          cache: cache,
        }
      }

      // Handle case when navigating to page in `pages` from `app`
      if (typeof flightData === 'string') {
        return {
          // Set href.
          canonicalUrl: flightData,
          // Enable mpaNavigation as this is a navigation that the app-router shouldn't handle.
          pushRef: { pendingPush: true, mpaNavigation: true },
          // Don't apply scroll and focus management.
          focusAndScrollRef: { apply: false },
          // Other state is kept as-is.
          cache: state.cache,
          prefetchCache: state.prefetchCache,
          tree: state.tree,
        }
      }

      // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
      const flightDataPath = flightData[0]

      // Slices off the last segment (which is at -4) as it doesn't exist in the tree yet
      const flightSegmentPath = flightDataPath.slice(0, -4)
      const [treePatch, subTreeData, head] = flightDataPath.slice(-3)

      const newTree = applyRouterStatePatchToTree(
        // TODO-APP: remove ''
        ['', ...flightSegmentPath],
        state.tree,
        treePatch
      )

      if (newTree === null) {
        throw new Error('SEGMENT MISMATCH')
      }

      const canonicalUrlOverrideHref = overrideCanonicalUrl
        ? createHrefFromUrl(overrideCanonicalUrl)
        : undefined

      if (canonicalUrlOverrideHref) {
        mutable.canonicalUrlOverride = canonicalUrlOverrideHref
      }

      mutable.patchedTree = newTree
      mutable.mpaNavigation = isNavigatingToNewRootLayout(state.tree, newTree)

      // Root refresh
      if (flightDataPath.length === 3) {
        cache.status = CacheStates.READY
        cache.subTreeData = subTreeData
        fillLazyItemsTillLeafWithHead(cache, state.cache, treePatch, head)
      } else {
        // Copy subTreeData for the root node of the cache.
        cache.status = CacheStates.READY
        cache.subTreeData = state.cache.subTreeData
        fillCacheWithNewSubTreeData(cache, state.cache, flightDataPath)
      }

      return {
        // Keep href as it was set during navigate / restore
        canonicalUrl: canonicalUrlOverrideHref
          ? canonicalUrlOverrideHref
          : state.canonicalUrl,
        // Keep pushRef as server-patch only causes cache/tree update.
        pushRef: state.pushRef,
        // Keep focusAndScrollRef as server-patch only causes cache/tree update.
        focusAndScrollRef: state.focusAndScrollRef,
        // Apply patched router state
        tree: newTree,
        prefetchCache: state.prefetchCache,
        // Apply patched cache
        cache: cache,
      }
    }
    case ACTION_RESTORE: {
      const { url, tree } = action
      const href = createHrefFromUrl(url)

      return {
        // Set canonical url
        canonicalUrl: href,
        pushRef: state.pushRef,
        focusAndScrollRef: state.focusAndScrollRef,
        cache: state.cache,
        prefetchCache: state.prefetchCache,
        // Restore provided tree
        tree: tree,
      }
    }
    case ACTION_REFRESH: {
      const { cache, mutable } = action
      const href = state.canonicalUrl

      const isForCurrentTree =
        JSON.stringify(mutable.previousTree) === JSON.stringify(state.tree)

      if (mutable.mpaNavigation && isForCurrentTree) {
        return {
          // Set href.
          canonicalUrl: mutable.canonicalUrlOverride
            ? mutable.canonicalUrlOverride
            : state.canonicalUrl,
          // TODO-APP: verify mpaNavigation not being set is correct here.
          pushRef: {
            pendingPush: true,
            mpaNavigation: mutable.mpaNavigation,
          },
          // All navigation requires scroll and focus management to trigger.
          focusAndScrollRef: { apply: false },
          // Apply cache.
          cache: state.cache,
          prefetchCache: state.prefetchCache,
          // Apply patched router state.
          tree: state.tree,
        }
      }

      // Handle concurrent rendering / strict mode case where the cache and tree were already populated.
      if (mutable.patchedTree && isForCurrentTree) {
        return {
          // Set href.
          canonicalUrl: mutable.canonicalUrlOverride
            ? mutable.canonicalUrlOverride
            : href,
          // set pendingPush (always false in this case).
          pushRef: state.pushRef,
          // Apply focus and scroll.
          // TODO-APP: might need to disable this for Fast Refresh.
          focusAndScrollRef: { apply: false },
          cache: cache,
          prefetchCache: state.prefetchCache,
          tree: mutable.patchedTree,
        }
      }

      if (!cache.data) {
        // Fetch data from the root of the tree.
        cache.data = createRecordFromThenable(
          fetchServerResponse(new URL(href, location.origin), [
            state.tree[0],
            state.tree[1],
            state.tree[2],
            'refetch',
          ])
        )
      }
      const [flightData, canonicalUrlOverride] = readRecordValue(cache.data!)

      // Handle case when navigating to page in `pages` from `app`
      if (typeof flightData === 'string') {
        return {
          canonicalUrl: flightData,
          pushRef: { pendingPush: true, mpaNavigation: true },
          focusAndScrollRef: { apply: false },
          cache: state.cache,
          prefetchCache: state.prefetchCache,
          tree: state.tree,
        }
      }

      // Remove cache.data as it has been resolved at this point.
      cache.data = null

      // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
      const flightDataPath = flightData[0]

      // FlightDataPath with more than two items means unexpected Flight data was returned
      if (flightDataPath.length !== 3) {
        // TODO-APP: handle this case better
        console.log('REFRESH FAILED')
        return state
      }

      // Given the path can only have two items the items are only the router state and subTreeData for the root.
      const [treePatch, subTreeData, head] = flightDataPath
      const newTree = applyRouterStatePatchToTree(
        // TODO-APP: remove ''
        [''],
        state.tree,
        treePatch
      )

      if (newTree === null) {
        throw new Error('SEGMENT MISMATCH')
      }

      const canonicalUrlOverrideHref = canonicalUrlOverride
        ? createHrefFromUrl(canonicalUrlOverride)
        : undefined

      if (canonicalUrlOverride) {
        mutable.canonicalUrlOverride = canonicalUrlOverrideHref
      }

      mutable.previousTree = state.tree
      mutable.patchedTree = newTree
      mutable.mpaNavigation = isNavigatingToNewRootLayout(state.tree, newTree)

      // Set subTreeData for the root node of the cache.
      cache.status = CacheStates.READY
      cache.subTreeData = subTreeData
      fillLazyItemsTillLeafWithHead(cache, state.cache, treePatch, head)

      return {
        // Set href, this doesn't reuse the state.canonicalUrl as because of concurrent rendering the href might change between dispatching and applying.
        canonicalUrl: canonicalUrlOverrideHref
          ? canonicalUrlOverrideHref
          : href,
        // set pendingPush (always false in this case).
        pushRef: state.pushRef,
        // TODO-APP: might need to disable this for Fast Refresh.
        focusAndScrollRef: { apply: false },
        // Apply patched cache.
        cache: cache,
        prefetchCache: state.prefetchCache,
        // Apply patched router state.
        tree: newTree,
      }
    }
    case ACTION_PREFETCH: {
      const { url, serverResponse } = action
      const [flightData, canonicalUrlOverride] = serverResponse

      if (typeof flightData === 'string') {
        return state
      }

      const href = createHrefFromUrl(url)

      // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
      const flightDataPath = flightData[0]

      // The one before last item is the router state tree patch
      const [treePatch] = flightDataPath.slice(-3)

      const flightSegmentPath = flightDataPath.slice(0, -3)

      const newTree = applyRouterStatePatchToTree(
        // TODO-APP: remove ''
        ['', ...flightSegmentPath],
        state.tree,
        treePatch
      )

      // Patch did not apply correctly
      if (newTree === null) {
        return state
      }

      // Create new tree based on the flightSegmentPath and router state patch
      state.prefetchCache.set(href, {
        flightData,
        // Create new tree based on the flightSegmentPath and router state patch
        tree: newTree,
        canonicalUrlOverride,
      })

      return state
    }
    // This case should never be hit as dispatch is strongly typed.
    default:
      throw new Error('Unknown action')
  }
}

function serverReducer(
  state: Readonly<AppRouterState>,
  _action: Readonly<
    | RefreshAction
    | NavigateAction
    | RestoreAction
    | ServerPatchAction
    | PrefetchAction
  >
): AppRouterState {
  return state
}

// we don't run the client reducer on the server, so we use a noop function for better tree shaking
export const reducer =
  typeof window === 'undefined' ? serverReducer : clientReducer
