import React from 'react'
import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack'
import {
  AppRouterContext,
  AppTreeContext,
  FullAppTreeContext,
} from '../../shared/lib/app-router-context'
import type { CacheNode } from '../../shared/lib/app-router-context'
import type { FlightRouterState, FlightData } from '../../server/app-render'

function fetchFlight(href: string, treeData: string) {
  const flightUrl = new URL(href, location.origin.toString())
  const searchParams = flightUrl.searchParams
  searchParams.append('__flight__', '1')
  searchParams.append('__flight_router_state_tree__', treeData)

  return fetch(flightUrl.toString())
}

export function fetchServerResponse(href: string, tree: any) {
  const treeData = JSON.stringify(tree)
  return createFromFetch(fetchFlight(href, treeData))
}

export default function AppRouter({
  initialTree,
  children,
}: {
  initialTree: FlightRouterState
  children: React.ReactNode
}) {
  const [{ tree, previousTree, cache }, setTree] = React.useState<{
    tree: FlightRouterState
    previousTree?: FlightRouterState
    cache: CacheNode
  }>({
    tree: initialTree,
    previousTree: initialTree,
    cache: {
      subTreeData: null,
      childNodes: new Map(),
    },
  })

  const change = React.useCallback(
    (
      method: 'replaceState' | 'pushState',
      href: string,
      historyState?: { tree: FlightRouterState },
      flightData?: FlightData
    ) => {
      // @ts-ignore startTransition exists
      React.startTransition(() => {
        // TODO: handling of hash urls
        const url = new URL(href, location.origin)
        const { pathname } = url

        if (flightData) {
          setTree((existingValue) => {
            // TODO: recursive function instead and evaluate the cache node changed or not
            const walkTreeWithFlightRouterState = (
              childNodes: CacheNode['childNodes'],
              treeToWalk: FlightData[0],
              flightRouterState?: FlightRouterState,
              firstItem?: boolean
            ): {
              childNodes: CacheNode['childNodes']
              tree: FlightRouterState
            } => {
              const [segment, parallelRoutes, subTreeData] = treeToWalk

              if (!firstItem) {
                if (childNodes.has(segment)) {
                  const childNode = childNodes.get(segment)!
                  childNode.data = null
                  if (subTreeData) {
                    childNode.subTreeData = subTreeData
                  }
                } else {
                  childNodes.set(segment, {
                    subTreeData: subTreeData ?? null,
                    childNodes: new Map(),
                  })
                }
              }

              const newFlightRouterState: FlightRouterState = [
                segment,
                parallelRoutes.children
                  ? {
                      ...(flightRouterState ? flightRouterState[1] : {}),
                      children: walkTreeWithFlightRouterState(
                        firstItem
                          ? childNodes
                          : childNodes.get(segment)!.childNodes,
                        parallelRoutes.children,
                        flightRouterState && flightRouterState[1].children
                      ).tree,
                    }
                  : {},
              ]

              if (firstItem) {
                newFlightRouterState[2] = url.pathname + url.search
              }

              return {
                childNodes: childNodes,
                tree: newFlightRouterState,
              }
            }

            // TODO: loop over this as it could hold multiple trees
            const flightDataTree = flightData[0]
            if (flightDataTree) {
              const walkedTree = walkTreeWithFlightRouterState(
                existingValue.cache.childNodes,
                flightDataTree,
                existingValue.tree,
                true
              )

              return {
                tree: walkedTree.tree,
                cache: existingValue.cache,
                previousTree: existingValue.previousTree,
              }
            }

            return existingValue
          })
        }

        setTree((existingValue) => {
          let newTree =
            historyState && historyState.tree
              ? historyState.tree
              : existingValue.tree

          if (!historyState && !flightData) {
            const createOptimisticTree = (
              segments: string[],
              [existingSegment, existingParallelRoutes]: FlightRouterState,
              isFirstSegment = false
            ): FlightRouterState => {
              const segment = segments[0]
              const isLastSegment = segments.length === 1

              let parallelRoutes: FlightRouterState[1] = {}
              if (existingSegment === segment) {
                parallelRoutes = existingParallelRoutes
              }

              let childTree
              if (!isLastSegment) {
                childTree = createOptimisticTree(
                  segments.slice(1),
                  existingParallelRoutes.children
                )
              }

              const result: FlightRouterState = [
                segment,
                isLastSegment
                  ? { children: ['page', {}] }
                  : {
                      ...parallelRoutes,
                      ...(childTree ? { children: childTree } : {}),
                    },
              ]

              // Add url into the tree
              if (isFirstSegment) {
                result[2] = url.pathname + url.search
              }

              return result
            }

            const segments = pathname.split('/')
            newTree = createOptimisticTree(segments, existingValue.tree, true)
          }

          // TODO: update url eagerly or not?
          window.history[method]({ tree: newTree }, '', href)

          return {
            cache: existingValue.cache,
            previousTree: existingValue.previousTree,
            tree: newTree,
          }
        })
      })
    },
    []
  )
  const appRouter = React.useMemo(() => {
    return {
      // TODO: implement prefetching of loading / flight
      prefetch: () => Promise.resolve({}),
      replace: (href: string) => {
        return change('replaceState', href)
      },
      push: (href: string) => {
        return change('pushState', href)
      },
    }
  }, [change])

  if (typeof window !== 'undefined') {
    // @ts-ignore TODO: this is for debugging
    window.nd = { router: appRouter, cache, tree }
  }

  const onPopState = React.useCallback(
    ({ state }: PopStateEvent) => {
      if (!state) {
        return
      }

      // @ts-ignore useTransition exists
      // TODO: Ideally the back button should not use startTransition as it should apply the updates synchronously
      React.startTransition(() => {
        change('replaceState', location.pathname, state)
      })
    },
    [change]
  )
  React.useEffect(() => {
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [onPopState])

  React.useEffect(() => {
    window.history.replaceState({ tree: initialTree }, '')
  }, [initialTree])

  const changeByServerResponse = React.useCallback(
    (flightData: FlightData) => {
      // TODO: revisit location.pathname usage
      change('replaceState', location.pathname, undefined, flightData)
    },
    [change]
  )

  return (
    <FullAppTreeContext.Provider
      value={{
        changeByServerResponse,
        // TODO: remove previousTree
        tree: previousTree,
      }}
    >
      <AppRouterContext.Provider value={appRouter}>
        <AppTreeContext.Provider
          value={{
            childNodes: cache.childNodes,
            tree: tree,
            // Root node always has `url`
            url: tree[2] as string,
          }}
        >
          {children}
        </AppTreeContext.Provider>
      </AppRouterContext.Provider>
    </FullAppTreeContext.Provider>
  )
}
