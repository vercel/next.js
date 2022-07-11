import React, { useEffect } from 'react'
import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack'
import {
  AppRouterContext,
  AppTreeContext,
  CacheNode,
  FullAppTreeContext,
} from '../../shared/lib/app-router-context'
import type { AppRouterInstance } from '../../shared/lib/app-router-context'
import type { FlightRouterState, FlightData } from '../../server/app-render'
import { reducer } from './reducer'
import {
  QueryContext,
  // ParamsContext,
  PathnameContext,
  // LayoutSegmentsContext,
} from './hooks-client-context'

function fetchFlight(
  url: URL,
  flightRouterStateData: string
): Promise<Response> {
  const flightUrl = new URL(url)
  const searchParams = flightUrl.searchParams
  searchParams.append('__flight__', '1')
  searchParams.append('__flight_router_state_tree__', flightRouterStateData)

  return fetch(flightUrl.toString())
}

export function fetchServerResponse(
  url: URL,
  flightRouterState: FlightRouterState
): { readRoot: () => FlightData } {
  const flightRouterStateData = JSON.stringify(flightRouterState)
  return createFromFetch(fetchFlight(url, flightRouterStateData))
}

// TODO: move this back into AppRouter
let initialParallelRoutes: CacheNode['parallelRoutes'] =
  typeof window === 'undefined' ? null! : new Map()

export default function AppRouter({
  initialTree,
  initialCanonicalUrl,
  children,
  hotReloader,
}: {
  initialTree: FlightRouterState
  initialCanonicalUrl: string
  children: React.ReactNode
  hotReloader?: React.ReactNode
}) {
  const [{ tree, cache, pushRef, canonicalUrl }, dispatch] = React.useReducer<
    typeof reducer
  >(reducer, {
    tree: initialTree,
    cache: {
      data: null,
      subTreeData: children,
      parallelRoutes:
        typeof window === 'undefined' ? new Map() : initialParallelRoutes,
    },
    pushRef: { pendingPush: false, mpaNavigation: false },
    canonicalUrl: initialCanonicalUrl,
  })

  useEffect(() => {
    initialParallelRoutes = null!
  }, [])

  const { query, pathname } = React.useMemo(() => {
    const url = new URL(
      canonicalUrl,
      typeof window === 'undefined' ? 'http://n' : window.location.href
    )
    const queryObj: { [key: string]: string } = {}
    url.searchParams.forEach((value, key) => {
      queryObj[key] = value
    })
    return { query: queryObj, pathname: url.pathname }
  }, [canonicalUrl])

  // Server response only patches the tree
  const changeByServerResponse = React.useCallback(
    (previousTree: FlightRouterState, flightData: FlightData) => {
      dispatch({
        type: 'server-patch',
        payload: {
          flightData,
          previousTree,
          cache: {
            data: null,
            subTreeData: null,
            parallelRoutes: new Map(),
          },
        },
      })
    },
    []
  )

  const appRouter = React.useMemo<AppRouterInstance>(() => {
    const navigate = (
      href: string,
      cacheType: 'hard' | 'soft',
      navigateType: 'push' | 'replace'
    ) => {
      return dispatch({
        type: 'navigate',
        payload: {
          url: new URL(href, location.origin),
          cacheType,
          navigateType,
          cache: {
            data: null,
            subTreeData: null,
            parallelRoutes: new Map(),
          },
          mutable: {},
        },
      })
    }

    const routerInstance: AppRouterInstance = {
      // TODO: implement prefetching of loading / flight
      prefetch: (_href) => Promise.resolve(),
      replace: (href) => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          navigate(href, 'hard', 'replace')
        })
      },
      softReplace: (href) => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          navigate(href, 'soft', 'replace')
        })
      },
      softPush: (href) => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          navigate(href, 'soft', 'push')
        })
      },
      push: (href) => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          navigate(href, 'hard', 'push')
        })
      },
      reload: () => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          dispatch({
            type: 'reload',
            payload: {
              // TODO: revisit if this needs to be passed.
              url: new URL(window.location.href),
              cache: {
                data: null,
                subTreeData: null,
                parallelRoutes: new Map(),
              },
              mutable: {},
            },
          })
        })
      },
    }

    return routerInstance
  }, [])

  useEffect(() => {
    if (pushRef.mpaNavigation) {
      window.location.href = canonicalUrl
      return
    }

    // Identifier is shortened intentionally.
    // __NA is used to identify if the history entry can be handled by the app-router.
    // __N is used to identify if the history entry can be handled by the old router.
    const historyState = { __NA: true, tree }
    if (pushRef.pendingPush) {
      pushRef.pendingPush = false

      window.history.pushState(historyState, '', canonicalUrl)
    } else {
      window.history.replaceState(historyState, '', canonicalUrl)
    }
  }, [tree, pushRef, canonicalUrl])

  if (typeof window !== 'undefined') {
    // @ts-ignore this is for debugging
    window.nd = { router: appRouter, cache, tree }
  }

  const onPopState = React.useCallback(({ state }: PopStateEvent) => {
    if (!state) {
      // TODO: this case only happens when pushState/replaceState was called outside of Next.js. It should probably reload the page in this case.
      return
    }

    // TODO: this case happens when pushState/replaceState was called outside of Next.js or when the history entry was pushed by the old router.
    // It reloads the page in this case but we might have to revisit this as the old router ignores it.
    if (!state.__NA) {
      window.location.reload()
      return
    }

    // @ts-ignore useTransition exists
    // TODO: Ideally the back button should not use startTransition as it should apply the updates synchronously
    // Without startTransition works if the cache is there for this path
    React.startTransition(() => {
      dispatch({
        type: 'restore',
        payload: {
          url: new URL(window.location.href),
          tree: state.tree,
        },
      })
    })
  }, [])

  React.useEffect(() => {
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [onPopState])
  return (
    <PathnameContext.Provider value={pathname}>
      <QueryContext.Provider value={query}>
        <FullAppTreeContext.Provider
          value={{
            changeByServerResponse,
            tree,
          }}
        >
          <AppRouterContext.Provider value={appRouter}>
            <AppTreeContext.Provider
              value={{
                childNodes: cache.parallelRoutes,
                tree: tree,
                // Root node always has `url`
                // Provided in AppTreeContext to ensure it can be overwritten in layout-router
                url: canonicalUrl,
              }}
            >
              {cache.subTreeData}
              {hotReloader}
            </AppTreeContext.Provider>
          </AppRouterContext.Provider>
        </FullAppTreeContext.Provider>
      </QueryContext.Provider>
    </PathnameContext.Provider>
  )
}
