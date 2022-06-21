import React from 'react'
import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack'
import {
  AppRouterContext,
  AppTreeContext,
  FullAppTreeContext,
} from '../../shared/lib/app-router-context'
import type { CacheNode } from '../../shared/lib/app-router-context'

function createResponseCache() {
  return new Map<string, any>()
}
// TODO: might not be needed
const rscCache = createResponseCache()

function fetchFlight(href: string, treeData: string) {
  const flightUrl = new URL(href, location.origin.toString())
  const searchParams = flightUrl.searchParams
  searchParams.append('__flight__', '1')
  if (treeData) {
    searchParams.append('__flight_router_state_tree__', treeData)
  }

  return fetch(flightUrl.toString())
}

export function fetchServerResponse(href: string, tree: any) {
  const treeData = JSON.stringify(tree)
  const cacheKey = href + treeData
  let response = rscCache.get(cacheKey)
  if (response) return response

  response = createFromFetch(fetchFlight(href, treeData))

  rscCache.set(cacheKey, response)
  return response
}

export default function AppRouter({ initialTree, children }: any) {
  const [{ tree, previousTree }, setTree] = React.useState<any>({
    tree: initialTree,
  })
  const [cache /*, setCache*/] = React.useState<CacheNode>({
    subTreeData: null,
    childNodes: new Map(),
  })

  const change = React.useCallback(
    (
      method: 'replaceState' | 'pushState',
      href: string,
      historyState?: any,
      data?: any
    ) => {
      // @ts-ignore startTransition exists
      React.startTransition(() => {
        if (data) {
          for (const { layoutPath, subTreeData } of data) {
            const segments = layoutPath.split('/')
            let currentNodes = cache.childNodes
            for (let i = 0; i < segments.length; i++) {
              const segment = segments[i]
              const firstSegment = i === 0
              const lastSegment = i === segments.length - 1

              if (firstSegment && segment === '') {
                continue
              }

              if (!currentNodes.has(segment)) {
                if (lastSegment) {
                  currentNodes.set(segment, {
                    subTreeData: null,
                    childNodes: new Map([
                      ['page', { subTreeData, childNodes: new Map() }],
                    ]),
                  })
                } else {
                  currentNodes.set(segment, {
                    subTreeData: null,
                    childNodes: new Map(),
                  })
                }

                continue
              }

              if (lastSegment) {
                currentNodes.get(segment)?.childNodes.set('page', {
                  subTreeData,
                  childNodes: new Map(),
                })
                continue
              }

              currentNodes = currentNodes.get(segment)!.childNodes
            }
          }
        }
        // TODO: handling of hash urls
        const url = new URL(href, location.origin)
        const { pathname } = url

        let newTree =
          historyState && historyState.tree ? historyState.tree : tree

        if (!historyState) {
          const createNewTree = (
            segments: string[],
            treeBranch: any,
            isFirstSegment = false
          ): any => {
            const segment = segments[0]
            const isLastSegment = segments.length === 1

            let existingTreeSegment = {}
            if (treeBranch.segment === segment) {
              existingTreeSegment = treeBranch
            }

            let childTree
            if (!isLastSegment) {
              childTree = createNewTree(segments.slice(1), treeBranch.children)
            }

            const result = {
              ...existingTreeSegment,
              segment,
              // Add `url` into the first segment
              ...(isFirstSegment ? { url: url.pathname + url.search } : {}),
              ...(childTree ? { children: childTree } : {}),
            }

            if (isLastSegment) {
              // Children could exist because of previous tree
              delete result.children
              result.children = {
                segment: 'page',
              }
            }

            return result
          }

          const segments = pathname.split('/')
          newTree = createNewTree(segments, tree, true)
        }

        // When navigating `tree` is an optimistic value of what to render
        // in case of navigating without rewrites/redirects the tree will likely line up with the actual tree that comes back from the server
        // however if this is not the case the layout-router will call back up to this function with the data that came back from the server
        // the `data` is then used to pre-populate the cache before calling `setTree`.
        // In that case `newTree` will be sent from the server and the current `tree` will be the optimistic value
        // whereas `previousTree` is what layout-routers are actually on the screen, hence why previousTree is set again when `data` exists
        setTree({ previousTree: data ? previousTree : tree, tree: newTree })

        // TODO: update url eagerly or not?
        window.history[method]({ tree: newTree }, '', href)
      })
    },
    [tree, cache, previousTree]
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
    window.nd = { appRouter, cache, tree }
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
    (root: any) => {
      // TODO: revisit location.pathname usage
      change('replaceState', location.pathname, { tree: root.tree }, root.data)
    },
    [change]
  )

  return (
    <FullAppTreeContext.Provider
      value={{
        changeByServerResponse,
        tree: previousTree ? previousTree : tree,
      }}
    >
      <AppRouterContext.Provider value={appRouter}>
        <AppTreeContext.Provider
          value={{
            childNodes: cache.childNodes,
            tree: tree,
            // Root node always has `url`
            url: tree.url,
          }}
        >
          {children}
        </AppTreeContext.Provider>
      </AppRouterContext.Provider>
    </FullAppTreeContext.Provider>
  )
}
