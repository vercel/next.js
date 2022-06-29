import type { CacheNode } from '../../shared/lib/app-router-context'
import type { FlightRouterState, FlightData } from '../../server/app-render'

const markRefetch = (
  treeToWalk: FlightRouterState,
  flightRouterState?: FlightRouterState,
  parentRefetch?: boolean
): FlightRouterState => {
  const [segment, parallelRoutes, url] = treeToWalk

  const shouldRefetchThisLevel =
    !flightRouterState || segment !== flightRouterState[0]

  const childRoute = parallelRoutes.children
    ? markRefetch(
        parallelRoutes.children,
        flightRouterState && flightRouterState[1].children,
        parentRefetch || shouldRefetchThisLevel
      )
    : null

  const newTree: FlightRouterState = [
    segment,
    {
      ...parallelRoutes,
      ...(childRoute ? { children: childRoute } : {}),
    },
    url,
  ]

  if (!parentRefetch && shouldRefetchThisLevel) {
    newTree[3] = 'refetch'
  }

  return newTree
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
        payload: { url: URL; cacheType: 'soft' | 'hard' }
      }
    | { type: 'restore'; payload: { url: URL; historyState: HistoryState } }
    | {
        type: 'server-patch'
        payload: {
          flightData: FlightData
          previousTree: FlightRouterState
        }
      }
): AppRouterState {
  if (action.type === 'restore') {
    const { url, historyState } = action.payload
    const href = url.pathname + url.search

    return {
      canonicalUrl: href,
      pushRef: state.pushRef,
      cache: state.cache,
      tree: historyState.tree,
    }
  }

  if (action.type === 'navigate') {
    const { url, cacheType } = action.payload
    const { pathname } = url
    // TODO: include hash
    const href = url.pathname + url.search

    const createOptimisticTree = (
      segments: string[],
      flightRouterState: FlightRouterState | null,
      isFirstSegment: boolean,
      parentRefetch: boolean
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

    const segments = pathname.split('/')
    // TODO: figure out something better for index pages
    segments.push('page')

    const optimisticTreeWithRefetch = createOptimisticTree(
      segments,
      state.tree,
      true,
      false
    )

    // Create new cache
    if (cacheType === 'hard') {
    }

    // TODO: hard push should use optimisticTree to create a new cache. If the item already exists, it should not recurse down creating extra nodes
    // If the item does not exists it should keep the existing cache

    return {
      canonicalUrl: href,
      pushRef: { pendingPush: true },
      cache: state.cache,
      tree: optimisticTreeWithRefetch,
    }
  }

  if (action.type === 'server-patch') {
    const { flightData, previousTree /* , newCache */ } = action.payload
    if (previousTree !== state.tree) {
      console.log('TREE MISMATCH')
      // TODO: Refetch here
      // return existingValue
    }

    // TODO: flightData could hold multiple paths
    const flightDataPath = flightData[0]

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
        throw new Error('TREE MISMATCH')
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

    const treePath = flightDataPath.slice(0, -2)
    const [treePatch, subTreeData] = flightDataPath.slice(-2)

    // TODO: put the new tree into history?
    const newTree = walkTreeWithFlightDataPath(treePath, state.tree, treePatch)

    // Fill cache with data from flightDataTree
    const fillCache = (
      cacheNode: CacheNode,
      flightSegmentPath: FlightData[0] // ["", "children", "dashboard", "children"], ["integrations", {children: ["page", {}]}], React.ReactNode
    ) => {
      const [parallelRouteKey, currentSegment] = flightSegmentPath
      const lastSegment = flightSegmentPath.length === 1

      if (lastSegment) {
        if (cacheNode.parallelRoutes[parallelRouteKey].has(treePatch[0])) {
          // const childNode = cacheNode.parallelRoutes[parallelRouteKey].get(
          //   treePatch[0]
          // )!
          // childNode.subTreeData = subTreeData
          // childNode.parallelRoutes = {}
        } else {
          cacheNode.parallelRoutes[parallelRouteKey].set(treePatch[0], {
            subTreeData,
            parallelRoutes: {},
          })
        }
      } else {
        const childNode =
          cacheNode.parallelRoutes[parallelRouteKey].get(currentSegment)!
        fillCache(childNode, flightSegmentPath.slice(2))
      }
    }

    // TODO: handle `/` case
    fillCache(state.cache, treePath.slice(1))

    return {
      canonicalUrl: state.canonicalUrl,
      pushRef: state.pushRef,
      tree: newTree,
      cache: state.cache,
    }
  }

  return state
}
