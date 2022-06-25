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
}

type HistoryState = { tree: FlightRouterState }
type RouterMethod = 'replaceState' | 'pushState'

export function reducer(
  state: AppRouterState,
  action:
    | { type: 'push'; payload: { url: URL; method: RouterMethod } }
    | { type: 'restore'; payload: { historyState: HistoryState } }
    | {
        type: 'server-patch'
        payload: {
          flightDataTree: FlightData[0]
          previousTree: FlightRouterState
        }
      }
): AppRouterState {
  console.log('ACTION', action)
  if (action.type === 'restore') {
    return {
      ...state,
      tree: action.payload.historyState.tree,
    }
  }

  if (action.type === 'push') {
    const { url, method } = action.payload
    const { pathname } = url
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
    const optimisticTree = createOptimisticTree(
      segments,
      state.tree,
      true,
      false
    )

    // TODO: hard push should use optimisticTree to create a new cache. If the item already exists, it should not recursive down creating extra nodes
    // If the item does not exists it should keep the existing cache

    console.log('NEW PUSH', {
      existingCache: state.cache,
      optimisticTree: optimisticTree,
    })

    // TODO: update url eagerly or not?
    // TODO: update during setting state or useEffect?
    window.history[method]({ tree: optimisticTree }, '', href)

    return {
      cache: state.cache,
      tree: optimisticTree,
    }
  }

  if (action.type === 'server-patch') {
    const { flightDataTree, previousTree /* , newCache */ } = action.payload
    if (previousTree !== state.tree) {
      console.log('TREE MISMATCH')
      // TODO: Refetch here
      // return existingValue
    }

    const walkTreeWithFlightRouterState = (
      treeToWalk: FlightData[0],
      flightRouterState?: FlightRouterState,
      firstItem?: boolean
    ): FlightRouterState => {
      const [segment, parallelRoutes] = treeToWalk

      const childItem = parallelRoutes.children
        ? walkTreeWithFlightRouterState(
            parallelRoutes.children,
            flightRouterState && flightRouterState[1].children
          )
        : null

      // Item excludes refetch
      const newFlightRouterState: FlightRouterState = [
        segment,
        childItem
          ? {
              ...(flightRouterState ? flightRouterState[1] : {}),
              children: childItem,
            }
          : {},
      ]

      // TODO: this is incorrect as it's the wrong url. Url can probably be removed.
      if (firstItem) {
        newFlightRouterState[2] = flightRouterState![2]
      }

      return newFlightRouterState
    }

    const newTree = walkTreeWithFlightRouterState(
      flightDataTree,
      state.tree,
      true
    )

    // Fill cache with data from flightDataTree
    const fillCache = (
      childNodes: CacheNode['parallelRoutes'],
      treeToWalk: FlightData[0]
    ) => {
      const [segment, parallelRoutes, subTreeData] = treeToWalk
      if (childNodes.children.has(segment)) {
        const currentItem = childNodes.children.get(segment)!

        if (!currentItem.subTreeData && subTreeData) {
          currentItem.subTreeData = subTreeData
        }

        if (!subTreeData && parallelRoutes.children) {
          fillCache(
            childNodes.children.get(segment)!.parallelRoutes,
            parallelRoutes.children
          )
        }
      } else {
        childNodes.children.set(segment, {
          subTreeData: subTreeData ? subTreeData : null,
          parallelRoutes: {
            children: new Map(),
          },
        })
      }
    }

    fillCache(state.cache.parallelRoutes, flightDataTree[1].children)

    return {
      tree: newTree,
      cache: state.cache,
    }
  }

  return state
}
