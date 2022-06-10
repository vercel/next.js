import React from 'react'
import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack'
import {
  AppRouterContext,
  AppTreeContext,
  AppTreeUpdateContext,
  CacheNode,
} from '../../shared/lib/app-router-context'

function createResponseCache() {
  return new Map<string, any>()
}
const rscCache = createResponseCache()

function fetchFlight(href: string, layoutPath?: string) {
  const flightUrl = new URL(href, location.origin.toString())
  const searchParams = flightUrl.searchParams
  searchParams.append('__flight__', '1')
  if (layoutPath) {
    searchParams.append('__flight_router_path__', layoutPath)
  }

  return fetch(flightUrl.toString())
}

export function fetchServerResponse(href: string, layoutPath?: string) {
  const cacheKey = href + layoutPath
  let response = rscCache.get(cacheKey)
  if (response) return response

  response = createFromFetch(fetchFlight(href, layoutPath))

  rscCache.set(cacheKey, response)
  return response
}

function createPathToFetch(tree: any) {
  let segmentPath = ''

  if (tree.children) {
    const path = createPathToFetch(tree.children)
    segmentPath = `${tree.segment}${path === '' ? '' : `/${path}`}`
  }

  return segmentPath
}

export default function AppRouter({ initialTree, children }: any) {
  const [tree, setTree] = React.useState<any>(initialTree)
  const [cache, setCache] = React.useState<CacheNode | null>(null)

  const change = React.useCallback(
    (
      method: 'replaceState' | 'pushState',
      href: string,
      historyState?: any
    ) => {
      // @ts-ignore startTransition exists
      React.startTransition(() => {
        const { pathname } = new URL(href, location.origin)
        const newCache: CacheNode = {
          subtreeData: null,
          childNodes: new Map(),
        }

        let newTree =
          historyState && historyState.tree ? historyState.tree : tree
        if (!historyState) {
          const createNewTree = (segments: string[], treeBranch: any): any => {
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
          newTree = createNewTree(segments, tree)
        }

        setCache(newCache)
        setTree(newTree)
        const state = { tree: newTree }

        // TODO: update url eagerly or not?
        window.history[method](state, '', href)
      })
    },
    [tree]
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

  const treePatch = React.useCallback((updatePayload: any) => {
    // setTree(() => {
    //   return updatePayload
    // })
  }, [])

  if (typeof window !== 'undefined') {
    // @ts-ignore TODO: this is for debugging
    window.appRouter = appRouter
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

  let root
  // TODO: Check the RSC cache first for the page you want to navigate to
  if (cache && !cache.childNodes.has(tree.children.segment)) {
    // eslint-disable-next-line
    const data = fetchServerResponse(createPathToFetch(tree), '')
    root = data.readRoot()
  }

  return (
    <AppRouterContext.Provider value={appRouter}>
      <AppTreeUpdateContext.Provider value={treePatch}>
        <AppTreeContext.Provider value={{ segmentPath: '', tree: tree }}>
          {root ? root : children}
        </AppTreeContext.Provider>
      </AppTreeUpdateContext.Provider>
    </AppRouterContext.Provider>
  )
}
