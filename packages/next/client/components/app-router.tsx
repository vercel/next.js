'use client'

import type { ReactNode } from 'react'
import React, { useEffect, useMemo, useCallback } from 'react'
import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack/client'
import {
  AppRouterContext,
  LayoutRouterContext,
  GlobalLayoutRouterContext,
} from '../../shared/lib/app-router-context'
import type {
  CacheNode,
  AppRouterInstance,
} from '../../shared/lib/app-router-context'
import type { FlightRouterState, FlightData } from '../../server/app-render'
import {
  ACTION_NAVIGATE,
  ACTION_PREFETCH,
  ACTION_REFRESH,
  ACTION_RESTORE,
  ACTION_SERVER_PATCH,
  reducer,
} from './reducer'
import {
  SearchParamsContext,
  // ParamsContext,
  PathnameContext,
  // LayoutSegmentsContext,
} from './hooks-client-context'
import { useReducerWithReduxDevtools } from './use-reducer-with-devtools'
import { ErrorBoundary, GlobalErrorComponent } from './error-boundary'

function urlToUrlWithoutFlightMarker(url: string): URL {
  const urlWithoutFlightParameters = new URL(url, location.origin)
  // TODO-APP: handle .rsc for static export case
  return urlWithoutFlightParameters
}

const HotReloader:
  | typeof import('./react-dev-overlay/hot-reloader-client').default
  | null =
  process.env.NODE_ENV === 'production'
    ? null
    : (require('./react-dev-overlay/hot-reloader-client')
        .default as typeof import('./react-dev-overlay/hot-reloader-client').default)

/**
 * Fetch the flight data for the provided url. Takes in the current router state to decide what to render server-side.
 */
export async function fetchServerResponse(
  url: URL,
  flightRouterState: FlightRouterState,
  prefetch?: true
): Promise<[FlightData: FlightData, canonicalUrlOverride: URL | undefined]> {
  const headers: {
    __rsc__: '1'
    __next_router_state_tree__: string
    __next_router_prefetch__?: '1'
  } = {
    // Enable flight response
    __rsc__: '1',
    // Provide the current router state
    __next_router_state_tree__: JSON.stringify(flightRouterState),
  }
  if (prefetch) {
    // Enable prefetch response
    headers.__next_router_prefetch__ = '1'
  }

  const res = await fetch(url.toString(), {
    headers,
  })
  const canonicalUrl = res.redirected
    ? urlToUrlWithoutFlightMarker(res.url)
    : undefined

  const isFlightResponse =
    res.headers.get('content-type') === 'application/octet-stream'

  // If fetch returns something different than flight response handle it like a mpa navigation
  if (!isFlightResponse) {
    return [res.url, undefined]
  }

  // Handle the `fetch` readable stream that can be unwrapped by `React.use`.
  const flightData: FlightData = await createFromFetch(Promise.resolve(res))
  return [flightData, canonicalUrl]
}

// Ensure the initialParallelRoutes are not combined because of double-rendering in the browser with Strict Mode.
// TODO-APP: move this back into AppRouter
let initialParallelRoutes: CacheNode['parallelRoutes'] =
  typeof window === 'undefined' ? null! : new Map()

const prefetched = new Set<string>()

type AppRouterProps = {
  initialHead: ReactNode
  initialTree: FlightRouterState
  initialCanonicalUrl: string
  children: ReactNode
  assetPrefix: string
}

/**
 * The global router that wraps the application components.
 */
function Router({
  initialHead,
  initialTree,
  initialCanonicalUrl,
  children,
  assetPrefix,
}: AppRouterProps) {
  const initialState = useMemo(() => {
    return {
      tree: initialTree,
      cache: {
        data: null,
        subTreeData: children,
        parallelRoutes:
          typeof window === 'undefined' ? new Map() : initialParallelRoutes,
      },
      prefetchCache: new Map(),
      pushRef: { pendingPush: false, mpaNavigation: false },
      focusAndScrollRef: { apply: false },
      canonicalUrl:
        initialCanonicalUrl +
        // Hash is read as the initial value for canonicalUrl in the browser
        // This is safe to do as canonicalUrl can't be rendered, it's only used to control the history updates the useEffect further down.
        (typeof window !== 'undefined' ? window.location.hash : ''),
    }
  }, [children, initialCanonicalUrl, initialTree])
  const [
    { tree, cache, prefetchCache, pushRef, focusAndScrollRef, canonicalUrl },
    dispatch,
    sync,
  ] = useReducerWithReduxDevtools(reducer, initialState)

  useEffect(() => {
    // Ensure initialParallelRoutes is cleaned up from memory once it's used.
    initialParallelRoutes = null!
  }, [])

  // Add memoized pathname/query for useSearchParams and usePathname.
  const { searchParams, pathname } = useMemo(() => {
    const url = new URL(
      canonicalUrl,
      typeof window === 'undefined' ? 'http://n' : window.location.href
    )

    return {
      // This is turned into a readonly class in `useSearchParams`
      searchParams: url.searchParams,
      pathname: url.pathname,
    }
  }, [canonicalUrl])

  /**
   * Server response that only patches the cache and tree.
   */
  const changeByServerResponse = useCallback(
    (
      previousTree: FlightRouterState,
      flightData: FlightData,
      overrideCanonicalUrl: URL | undefined
    ) => {
      dispatch({
        type: ACTION_SERVER_PATCH,
        flightData,
        previousTree,
        overrideCanonicalUrl,
        cache: {
          data: null,
          subTreeData: null,
          parallelRoutes: new Map(),
        },
        mutable: {},
      })
    },
    [dispatch]
  )

  /**
   * The app router that is exposed through `useRouter`. It's only concerned with dispatching actions to the reducer, does not hold state.
   */
  const appRouter = useMemo<AppRouterInstance>(() => {
    const navigate = (
      href: string,
      navigateType: 'push' | 'replace',
      forceOptimisticNavigation: boolean
    ) => {
      return dispatch({
        type: ACTION_NAVIGATE,
        url: new URL(href, location.origin),
        forceOptimisticNavigation,
        navigateType,
        cache: {
          data: null,
          subTreeData: null,
          parallelRoutes: new Map(),
        },
        mutable: {},
      })
    }

    const routerInstance: AppRouterInstance = {
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      // TODO-APP: implement prefetching of flight
      prefetch: async (href) => {
        // If prefetch has already been triggered, don't trigger it again.
        if (prefetched.has(href)) {
          return
        }
        prefetched.add(href)
        const url = new URL(href, location.origin)
        try {
          const routerTree = window.history.state?.tree || initialTree
          // TODO-APP: handle case where history.state is not the new router history entry
          const serverResponse = await fetchServerResponse(
            url,
            // initialTree is used when history.state.tree is missing because the history state is set in `useEffect` below, it being missing means this is the hydration case.
            routerTree,
            true
          )
          // @ts-ignore startTransition exists
          React.startTransition(() => {
            dispatch({
              type: ACTION_PREFETCH,
              url,
              tree: routerTree,
              serverResponse,
            })
          })
        } catch (err) {
          console.error('PREFETCH ERROR', err)
        }
      },
      replace: (href, options = {}) => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          navigate(href, 'replace', Boolean(options.forceOptimisticNavigation))
        })
      },
      push: (href, options = {}) => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          navigate(href, 'push', Boolean(options.forceOptimisticNavigation))
        })
      },
      refresh: () => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          dispatch({
            type: ACTION_REFRESH,

            // TODO-APP: revisit if this needs to be passed.
            cache: {
              data: null,
              subTreeData: null,
              parallelRoutes: new Map(),
            },
            mutable: {},
          })
        })
      },
    }

    return routerInstance
  }, [dispatch, initialTree])

  useEffect(() => {
    // When mpaNavigation flag is set do a hard navigation to the new url.
    if (pushRef.mpaNavigation) {
      window.location.href = canonicalUrl
      return
    }

    // Identifier is shortened intentionally.
    // __NA is used to identify if the history entry can be handled by the app-router.
    // __N is used to identify if the history entry can be handled by the old router.
    const historyState = { __NA: true, tree }
    if (pushRef.pendingPush) {
      // This intentionally mutates React state, pushRef is overwritten to ensure additional push/replace calls do not trigger an additional history entry.
      pushRef.pendingPush = false

      window.history.pushState(historyState, '', canonicalUrl)
    } else {
      window.history.replaceState(historyState, '', canonicalUrl)
    }

    sync()
  }, [tree, pushRef, canonicalUrl, sync])

  // Add `window.nd` for debugging purposes.
  // This is not meant for use in applications as concurrent rendering will affect the cache/tree/router.
  if (typeof window !== 'undefined') {
    // @ts-ignore this is for debugging
    window.nd = { router: appRouter, cache, prefetchCache, tree }
  }

  /**
   * Handle popstate event, this is used to handle back/forward in the browser.
   * By default dispatches ACTION_RESTORE, however if the history entry was not pushed/replaced by app-router it will reload the page.
   * That case can happen when the old router injected the history entry.
   */
  const onPopState = useCallback(
    ({ state }: PopStateEvent) => {
      if (!state) {
        // TODO-APP: this case only happens when pushState/replaceState was called outside of Next.js. It should probably reload the page in this case.
        return
      }

      // TODO-APP: this case happens when pushState/replaceState was called outside of Next.js or when the history entry was pushed by the old router.
      // It reloads the page in this case but we might have to revisit this as the old router ignores it.
      if (!state.__NA) {
        window.location.reload()
        return
      }

      // @ts-ignore useTransition exists
      // TODO-APP: Ideally the back button should not use startTransition as it should apply the updates synchronously
      // Without startTransition works if the cache is there for this path
      React.startTransition(() => {
        dispatch({
          type: ACTION_RESTORE,
          url: new URL(window.location.href),
          tree: state.tree,
        })
      })
    },
    [dispatch]
  )

  // Register popstate event to call onPopstate.
  useEffect(() => {
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [onPopState])

  return (
    <PathnameContext.Provider value={pathname}>
      <SearchParamsContext.Provider value={searchParams}>
        <GlobalLayoutRouterContext.Provider
          value={{
            changeByServerResponse,
            tree,
            focusAndScrollRef,
          }}
        >
          <AppRouterContext.Provider value={appRouter}>
            <LayoutRouterContext.Provider
              value={{
                childNodes: cache.parallelRoutes,
                tree: tree,
                // Root node always has `url`
                // Provided in AppTreeContext to ensure it can be overwritten in layout-router
                url: canonicalUrl,
              }}
            >
              {HotReloader ? (
                <HotReloader assetPrefix={assetPrefix}>
                  {initialHead}
                  {cache.subTreeData}
                </HotReloader>
              ) : (
                <>
                  {initialHead}
                  {cache.subTreeData}
                </>
              )}
            </LayoutRouterContext.Provider>
          </AppRouterContext.Provider>
        </GlobalLayoutRouterContext.Provider>
      </SearchParamsContext.Provider>
    </PathnameContext.Provider>
  )
}

export default function AppRouter(props: AppRouterProps) {
  return (
    <ErrorBoundary errorComponent={GlobalErrorComponent}>
      <Router {...props} />
    </ErrorBoundary>
  )
}
