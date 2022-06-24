import React from 'react'
import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack'
import {
  AppRouterContext,
  AppTreeContext,
  FullAppTreeContext,
} from '../../shared/lib/app-router-context'
import type { CacheNode } from '../../shared/lib/app-router-context'
import type { FlightRouterState, FlightData } from '../../server/app-render'

function fetchFlight(url: URL, treeData: string) {
  const flightUrl = new URL(url)
  const searchParams = flightUrl.searchParams
  searchParams.append('__flight__', '1')
  searchParams.append('__flight_router_state_tree__', treeData)

  return fetch(flightUrl.toString())
}

export function fetchServerResponse(url: URL, tree: any) {
  const treeData = JSON.stringify(tree)
  return createFromFetch(fetchFlight(url, treeData))
}

export type AppRouterState = {
  tree: FlightRouterState
  cache: CacheNode
}

export default function AppRouter({
  initialTree,
  children,
}: {
  initialTree: FlightRouterState
  children: React.ReactNode
}) {
  const [{ tree, cache }, setTree] = React.useState<AppRouterState>({
    tree: initialTree,
    cache: {
      subTreeData: null,
      childNodes: new Map(),
    },
  })

  // Server response only patches the tree
  const changeByServerResponse = React.useCallback(
    (previousTree: FlightRouterState, flightData: FlightData) => {
      // TODO: loop over this as it could hold multiple trees
      const flightDataTree = flightData[0]

      if (!flightDataTree) {
        return
      }

      const createNewCache = (
        childNodes: CacheNode['childNodes'] | null,
        treeToWalk: FlightData[0]
      ): CacheNode['childNodes'] => {
        const [segment, parallelRoutes, subTreeData] = treeToWalk

        const current = new Map()

        if (childNodes) {
          for (const [path, child] of childNodes) {
            current.set(path, {
              subTreeData: child.subTreeData,
              childNodes: new Map(),
            })
          }
        }

        const child = parallelRoutes.children
          ? createNewCache(
              childNodes ? childNodes.get(segment)!?.childNodes : null,
              parallelRoutes.children
            )
          : new Map()

        if (current.has(segment)) {
          const currentItem = current.get(segment)!
          current.set(segment, {
            subTreeData: subTreeData ?? currentItem.subTreeData,
            childNodes: child,
          })
        } else {
          current.set(segment, {
            subTreeData: subTreeData,
            childNodes: child,
          })
        }

        return current
      }

      const newCacheNodes = createNewCache(
        cache.childNodes,
        flightDataTree[1].children
      )

      const newCache = {
        subTreeData: null,
        childNodes: newCacheNodes,
      }

      setTree((existingValue) => {
        if (previousTree !== existingValue.tree) {
          // TODO: Refetch here
          return existingValue
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
          existingValue.tree,
          true
        )

        return {
          tree: newTree,
          cache: newCache,
        }
      })
    },
    [cache.childNodes]
  )

  const change = React.useCallback(
    (
      method: 'replaceState' | 'pushState',
      href: string,
      historyState?: { tree: FlightRouterState }
    ) => {
      // @ts-ignore startTransition exists
      React.startTransition(() => {
        // TODO: handling of hash urls
        const url = new URL(href, location.origin)
        const { pathname } = url

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

        setTree((existingValue) => {
          if (historyState) {
            return {
              cache: existingValue.cache,
              tree: historyState.tree,
            }
          }

          const createOptimisticTree = (
            segments: string[],
            flightRouterState: FlightRouterState | null,
            isFirstSegment: boolean,
            parentRefetch: boolean
          ): FlightRouterState => {
            const [existingSegment, existingParallelRoutes] =
              flightRouterState || [null, {}]
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
              result[2] = url.pathname + url.search
            }

            return result
          }

          const segments = pathname.split('/')
          // TODO: figure out something better for index pages
          segments.push('page')
          const optimisticTree = createOptimisticTree(
            segments,
            existingValue.tree,
            true,
            false
          )

          console.log('NEW CACHE PUSH', {
            existingChildNodes: existingValue.cache.childNodes,
            optimisticTree: optimisticTree,
          })

          // TODO: update url eagerly or not?
          window.history[method]({ tree: optimisticTree }, '', href)

          return {
            cache: existingValue.cache,
            tree: optimisticTree,
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

  return (
    <FullAppTreeContext.Provider
      value={{
        changeByServerResponse,
        tree,
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
