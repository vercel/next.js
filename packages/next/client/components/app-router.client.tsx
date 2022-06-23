import React from 'react'
import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack'
import {
  AppRouterContext,
  AppTreeContext,
  FullAppTreeContext,
} from '../../shared/lib/app-router-context'
import type { CacheNode } from '../../shared/lib/app-router-context'
import type { FlightRouterState, FlightData } from '../../server/app-render'
import { createOptimisticTree } from './helpers'

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
  previousTree?: FlightRouterState
  cache: CacheNode
}

export default function AppRouter({
  initialTree,
  children,
}: {
  initialTree: FlightRouterState
  children: React.ReactNode
}) {
  const [{ tree, previousTree, cache }, setTree] =
    React.useState<AppRouterState>({
      tree: initialTree,
      previousTree: initialTree,
      cache: {
        subTreeData: null,
        childNodes: new Map(),
      },
    })

  // Server response only patches the tree
  const changeByServerResponse = React.useCallback((flightData: FlightData) => {
    // TODO: loop over this as it could hold multiple trees
    const flightDataTree = flightData[0]

    if (!flightDataTree) {
      return
    }

    // setTree((existingValue) => {
    //   // TODO: recursive function instead and evaluate the cache node changed or not
    //   const walkTreeWithFlightRouterState = (
    //     childNodes: CacheNode['childNodes'] | null,
    //     treeToWalk: FlightData[0],
    //     flightRouterState?: FlightRouterState,
    //     firstItem?: boolean,
    //     parentFetchingData?: boolean
    //   ): {
    //     childNodes: CacheNode['childNodes']
    //     tree: FlightRouterState
    //   } => {
    //     const [segment, parallelRoutes, subTreeData] = treeToWalk

    //     if (childNodes && !firstItem && !parentFetchingData) {
    //       if (childNodes.has(segment)) {
    //         const childNode = childNodes.get(segment)!
    //         childNode.data = null
    //         if (subTreeData) {
    //           childNode.subTreeData = subTreeData
    //         }
    //       } else {
    //         childNodes = new Map(childNodes)
    //         childNodes.set(segment, {
    //           subTreeData: subTreeData ?? null,
    //           childNodes: new Map(),
    //         })
    //       }
    //     }

    //     const passedChildNodes =
    //       childNodes && !subTreeData
    //         ? firstItem
    //           ? childNodes
    //           : childNodes.get(segment)!.childNodes
    //         : null
    //     const childItem = parallelRoutes.children
    //       ? walkTreeWithFlightRouterState(
    //           passedChildNodes,
    //           parallelRoutes.children,
    //           flightRouterState && flightRouterState[1].children,
    //           false,
    //           parentFetchingData || Boolean(subTreeData)
    //         )
    //       : null

    //     if (childItem) {
    //       if (childItem.childNodes !== passedChildNodes) {
    //         if (firstItem) {
    //           childNodes = new Map(childNodes)
    //         } else {
    //           childNodes = new Map(childNodes)
    //           const childItemNode = childNodes.get(segment)!
    //           childItemNode.childNodes = childItem.childNodes
    //         }
    //       }
    //     }

    //     const newFlightRouterState: FlightRouterState = [
    //       segment,
    //       childItem
    //         ? {
    //             ...(flightRouterState ? flightRouterState[1] : {}),
    //             children: childItem.tree,
    //           }
    //         : {},
    //     ]

    //     // TODO: this is incorrect. Url can probably be removed.
    //     if (firstItem) {
    //       newFlightRouterState[2] = flightRouterState![2]
    //     }

    //     return {
    //       childNodes: childNodes,
    //       tree: newFlightRouterState,
    //     }
    //   }

    //   const walkedTree = walkTreeWithFlightRouterState(
    //     existingValue.cache.childNodes,
    //     flightDataTree,
    //     existingValue.tree,
    //     true
    //   )

    //   let overrideCache: CacheNode | null = null

    //   if (walkedTree.childNodes !== existingValue.cache.childNodes) {
    //     console.log('NEW CACHE SERVER RESPONSE')
    //     overrideCache = {
    //       subTreeData: null,
    //       childNodes: walkedTree.childNodes,
    //     }
    //   }

    //   return {
    //     tree: walkedTree.tree,
    //     cache: overrideCache ? overrideCache : existingValue.cache,
    //     previousTree: existingValue.previousTree,
    //   }
    // })
  }, [])

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

        setTree((existingValue) => {
          if (historyState) {
            return {
              cache: existingValue.cache,
              previousTree: existingValue.previousTree,
              tree: historyState.tree ? historyState.tree : existingValue.tree,
            }
          }

          const segments = pathname.split('/')
          // TODO: figure out something better for index pages
          segments.push('page')
          const optimisticValue = createOptimisticTree(
            existingValue,
            url,
            segments,
            existingValue.tree,
            existingValue.cache.childNodes,
            true,
            false
          )

          console.log('NEW CACHE PUSH', {
            existingChildNodes: existingValue.cache.childNodes,
            childNodes: optimisticValue.childNodes,
          })

          // TODO: update url eagerly or not?
          window.history[method]({ tree: optimisticValue.tree }, '', href)

          return {
            cache: {
              subTreeData: null,
              childNodes: optimisticValue.childNodes,
            },
            previousTree: existingValue.previousTree,
            tree: optimisticValue.tree,
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
