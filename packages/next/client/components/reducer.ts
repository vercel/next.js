import type { CacheNode } from '../../shared/lib/app-router-context'
import type {
  FlightRouterState,
  FlightData,
  FlightDataPath,
} from '../../server/app-render'
import { fetchServerResponse } from './app-router.client'

const fillCacheWithNewSubTreeData = (
  newCache: CacheNode,
  existingCache: CacheNode,
  flightDataPath: FlightDataPath
) => {
  // TODO: handle case of / (root of the tree) refetch
  const isLastEntry = flightDataPath.length <= 4
  const [parallelRouteKey, segment] = flightDataPath

  const existingChildSegmentMap =
    existingCache.parallelRoutes.get(parallelRouteKey)

  if (!existingChildSegmentMap) {
    // Bailout because the existing cache does not have the path to the leaf node
    // Will trigger lazy fetch in layout-router because of missing segment
    return
  }

  let childSegmentMap = newCache.parallelRoutes.get(parallelRouteKey)
  if (!childSegmentMap || childSegmentMap === existingChildSegmentMap) {
    childSegmentMap = new Map(existingChildSegmentMap)
    newCache.parallelRoutes.set(parallelRouteKey, childSegmentMap)
  }

  const existingChildCacheNode = existingChildSegmentMap.get(segment)
  let childCacheNode = childSegmentMap.get(segment)

  // In case of last segment start off the fetch at this level and don't copy further down.
  if (isLastEntry) {
    if (
      !childCacheNode ||
      !childCacheNode.data ||
      childCacheNode === existingChildCacheNode
    ) {
      childSegmentMap.set(segment, {
        data: null,
        subTreeData: flightDataPath[3],
        parallelRoutes: new Map(),
      })
    }
    return
  }

  if (!childCacheNode || !existingChildCacheNode) {
    // Bailout because the existing cache does not have the path to the leaf node
    // Will trigger lazy fetch in layout-router because of missing segment
    return
  }

  if (childCacheNode === existingChildCacheNode) {
    childCacheNode = {
      data: childCacheNode.data,
      subTreeData: childCacheNode.subTreeData,
      parallelRoutes: new Map(childCacheNode.parallelRoutes),
    }
    childSegmentMap.set(segment, childCacheNode)
  }

  fillCacheWithNewSubTreeData(
    childCacheNode,
    existingChildCacheNode,
    flightDataPath.slice(2)
  )
}

const fillCacheWithDataProperty = (
  newCache: CacheNode,
  existingCache: CacheNode,
  segments: string[],
  fetchResponse: any
): { bailOptimistic: boolean } | undefined => {
  const isLastEntry = segments.length === 1

  const parallelRouteKey = 'children'
  const [segment] = segments

  const existingChildSegmentMap =
    existingCache.parallelRoutes.get(parallelRouteKey)

  if (!existingChildSegmentMap) {
    // Bailout because the existing cache does not have the path to the leaf node
    // Will trigger lazy fetch in layout-router because of missing segment
    return { bailOptimistic: true }
  }

  let childSegmentMap = newCache.parallelRoutes.get(parallelRouteKey)

  if (!childSegmentMap || childSegmentMap === existingChildSegmentMap) {
    childSegmentMap = new Map(existingChildSegmentMap)
    newCache.parallelRoutes.set(parallelRouteKey, childSegmentMap)
  }

  const existingChildCacheNode = existingChildSegmentMap.get(segment)
  let childCacheNode = childSegmentMap.get(segment)

  // In case of last segment start off the fetch at this level and don't copy further down.
  if (isLastEntry) {
    if (
      !childCacheNode ||
      !childCacheNode.data ||
      childCacheNode === existingChildCacheNode
    ) {
      childSegmentMap.set(segment, {
        data: fetchResponse(),
        subTreeData: null,
        parallelRoutes: new Map(),
      })
    }
    return
  }

  if (!childCacheNode || !existingChildCacheNode) {
    // Start fetch in the place where the existing cache doesn't have the data yet.
    if (!childCacheNode) {
      childSegmentMap.set(segment, {
        data: fetchResponse(),
        subTreeData: null,
        parallelRoutes: new Map(),
      })
    }
    return
  }

  if (childCacheNode === existingChildCacheNode) {
    childCacheNode = {
      data: childCacheNode.data,
      subTreeData: childCacheNode.subTreeData,
      parallelRoutes: new Map(childCacheNode.parallelRoutes),
    }
    childSegmentMap.set(segment, childCacheNode)
  }

  return fillCacheWithDataProperty(
    childCacheNode,
    existingChildCacheNode,
    segments.slice(1),
    fetchResponse
  )
}

const createOptimisticTree = (
  segments: string[],
  flightRouterState: FlightRouterState | null,
  isFirstSegment: boolean,
  parentRefetch: boolean,
  href?: string
): FlightRouterState => {
  const [existingSegment, existingParallelRoutes] = flightRouterState || [
    null,
    {},
  ]
  const segment = segments[0]
  const isLastSegment = segments.length === 1

  const shouldRefetchThisLevel =
    !flightRouterState || segment !== flightRouterState[0]

  let parallelRoutes: FlightRouterState[1] = {}
  if (existingSegment === segment) {
    parallelRoutes = existingParallelRoutes
  }

  let childTree
  if (!isLastSegment) {
    const childItem = createOptimisticTree(
      segments.slice(1),
      parallelRoutes ? parallelRoutes.children : null,
      false,
      parentRefetch || shouldRefetchThisLevel
    )

    childTree = childItem
  }

  const result: FlightRouterState = [
    segment,
    {
      ...parallelRoutes,
      ...(childTree ? { children: childTree } : {}),
    },
  ]

  if (!parentRefetch && shouldRefetchThisLevel) {
    result[3] = 'refetch'
  }

  // Add url into the tree
  if (isFirstSegment) {
    result[2] = href
  }

  return result
}

const walkTreeWithFlightDataPath = (
  flightSegmentPath: FlightData[0],
  flightRouterState: FlightRouterState,
  treePatch: FlightRouterState
): FlightRouterState => {
  const [segment, parallelRoutes, url] = flightRouterState
  const [currentSegment, parallelRouteKey] = flightSegmentPath

  // Tree path returned from the server should always match up with the current tree in the browser
  // TODO: verify
  if (segment !== currentSegment) {
    throw new Error('SEGMENT MISMATCH')
  }

  const lastSegment = flightSegmentPath.length === 2

  const tree: FlightRouterState = [
    flightSegmentPath[0],
    {
      ...parallelRoutes,
      [parallelRouteKey]: lastSegment
        ? treePatch
        : walkTreeWithFlightDataPath(
            flightSegmentPath.slice(2),
            parallelRoutes[parallelRouteKey],
            treePatch
          ),
    },
  ]

  if (url) {
    tree.push(url)
  }

  return tree
}

type AppRouterState = {
  tree: FlightRouterState
  cache: CacheNode
  pushRef: { pendingPush: boolean }
  canonicalUrl: string
}

type HistoryState = { tree: FlightRouterState }

export function reducer(
  state: AppRouterState,
  action:
    | {
        type: 'navigate'
        payload: {
          url: URL
          cacheType: 'soft' | 'hard'
          cache: CacheNode
          mutable: {
            previousTree?: FlightRouterState
            patchedTree?: FlightRouterState
          }
        }
      }
    | { type: 'restore'; payload: { url: URL; historyState: HistoryState } }
    | {
        type: 'server-patch'
        payload: {
          flightData: FlightData
          previousTree: FlightRouterState
          cache: CacheNode
        }
      }
): AppRouterState {
  console.log(action.type, action.payload)
  if (action.type === 'restore') {
    const { url, historyState } = action.payload
    const href = url.pathname + url.search + url.hash

    return {
      canonicalUrl: href,
      pushRef: state.pushRef,
      cache: state.cache,
      tree: historyState.tree,
    }
  }

  if (action.type === 'navigate') {
    const { url, cacheType, cache, mutable } = action.payload
    const { pathname } = url
    const href = url.pathname + url.search + url.hash

    const segments = pathname.split('/')
    // TODO: figure out something better for index pages
    segments.push('')

    // In case of soft push data fetching happens in layout-router if a segment is missing
    if (cacheType === 'soft') {
      const optimisticTree = createOptimisticTree(
        segments,
        state.tree,
        true,
        false,
        href
      )

      return {
        canonicalUrl: href,
        pushRef: { pendingPush: true },
        cache: state.cache,
        tree: optimisticTree,
      }
    }

    // When doing a hard push there can be two cases: with optimistic tree and without
    // The with optimistic tree case only happens when the layouts have a loading state (loading.js)
    // The without optimistic tree case happens when there is no loading state, in that case we suspend in this reducer
    if (cacheType === 'hard') {
      // TODO: flag on the tree of which part of the tree for if there is a loading boundary
      const isOptimistic = false

      if (isOptimistic) {
        // Build optimistic tree
        // If the optimistic tree is deeper than the current state leave that deeper part out of the fetch
        const optimisticTree = createOptimisticTree(
          segments,
          state.tree,
          true,
          false,
          href
        )

        // Fill in the cache with blank that holds the `data` field.
        // TODO: segments.slice(1) strips '', we can get rid of '' altogether.
        const res = fillCacheWithDataProperty(
          cache,
          state.cache,
          segments.slice(1),
          () => fetchServerResponse(url, optimisticTree)
        )

        if (!res?.bailOptimistic) {
          return {
            canonicalUrl: href,
            pushRef: { pendingPush: true },
            cache: cache,
            tree: optimisticTree,
          }
        }
      }

      if (
        mutable.patchedTree &&
        JSON.stringify(mutable.previousTree) === JSON.stringify(state.tree)
      ) {
        return {
          canonicalUrl: href,
          pushRef: { pendingPush: true },
          cache: cache,
          tree: mutable.patchedTree,
        }
      }

      if (!cache.data) {
        cache.data = fetchServerResponse(url, state.tree)
      }
      const root = cache.data.readRoot()
      console.log('ROOT FROM PUSH', root)
      cache.data = null

      // TODO: ensure flightDataPath does not have "" as first item
      const flightDataPath = root[0]

      const [treePatch] = flightDataPath.slice(-2)
      const treePath = flightDataPath.slice(0, -3)
      const newTree = walkTreeWithFlightDataPath(
        // TODO: remove ''
        ['', ...treePath],
        state.tree,
        treePatch
      )

      mutable.previousTree = state.tree
      mutable.patchedTree = newTree

      fillCacheWithNewSubTreeData(cache, state.cache, flightDataPath)
      console.log('CACHE', {
        flightDataPath,
        cache,
        previousCache: state.cache,
      })

      return {
        canonicalUrl: href,
        pushRef: { pendingPush: true },
        cache: cache,
        tree: newTree,
      }
    }

    return state
  }

  if (action.type === 'server-patch') {
    const { flightData, previousTree, cache } = action.payload
    if (JSON.stringify(previousTree) !== JSON.stringify(state.tree)) {
      // TODO: Handle tree mismatch
      console.log('TREE MISMATCH')
      return {
        canonicalUrl: state.canonicalUrl,
        pushRef: state.pushRef,
        tree: state.tree,
        cache: state.cache,
      }
    }

    // TODO: flightData could hold multiple paths
    const flightDataPath = flightData[0]

    // Slices off the last segment (which is at -3) as it doesn't exist in the tree yet
    const treePath = flightDataPath.slice(0, -3)
    const [treePatch] = flightDataPath.slice(-2)

    const newTree = walkTreeWithFlightDataPath(treePath, state.tree, treePatch)

    // TODO: update flightDataPath to not have "" as first item
    fillCacheWithNewSubTreeData(cache, state.cache, flightDataPath)
    console.log('CACHE', {
      flightDataPath,
      cache,
      previousCache: state.cache,
    })

    return {
      canonicalUrl: state.canonicalUrl,
      pushRef: state.pushRef,
      tree: newTree,
      cache: cache,
    }
  }

  return state
}
