import type { PropsWithChildren, ReactElement, ReactNode } from 'react'
import React, { useEffect, useMemo, useCallback } from 'react'
import { createFromReadableStream } from 'next/dist/compiled/react-server-dom-webpack'
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
  ACTION_RELOAD,
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

/**
 * Fetch the flight data for the provided url. Takes in the current router state to decide what to render server-side.
 */
function fetchFlight(
  url: URL,
  flightRouterState: FlightRouterState,
  prefetch?: true
): ReadableStream {
  const flightUrl = new URL(url)
  const searchParams = flightUrl.searchParams
  // Enable flight response
  searchParams.append('__flight__', '1')
  // Provide the current router state
  searchParams.append(
    '__flight_router_state_tree__',
    JSON.stringify(flightRouterState)
  )
  if (prefetch) {
    searchParams.append('__flight_prefetch__', '1')
  }

  // TODO-APP: Verify that TransformStream is supported.
  const { readable, writable } = new TransformStream()

  fetch(flightUrl.toString()).then((res) => {
    res.body?.pipeTo(writable)
  })

  return readable
}

/**
 * Fetch the flight data for the provided url. Takes in the current router state to decide what to render server-side.
 */
export function fetchServerResponse(
  url: URL,
  flightRouterState: FlightRouterState,
  prefetch?: true
): { readRoot: () => FlightData } {
  // Handle the `fetch` readable stream that can be read using `readRoot`.
  return createFromReadableStream(fetchFlight(url, flightRouterState, prefetch))
}

/**
 * Renders development error overlay when NODE_ENV is development.
 */
function ErrorOverlay({ children }: PropsWithChildren<{}>): ReactElement {
  if (process.env.NODE_ENV === 'production') {
    return <>{children}</>
  } else {
    const {
      ReactDevOverlay,
    } = require('next/dist/compiled/@next/react-dev-overlay/dist/client')
    return <ReactDevOverlay globalOverlay>{children}</ReactDevOverlay>
  }
}

// Ensure the initialParallelRoutes are not combined because of double-rendering in the browser with Strict Mode.
// TODO-APP: move this back into AppRouter
let initialParallelRoutes: CacheNode['parallelRoutes'] =
  typeof window === 'undefined' ? null! : new Map()

const prefetched = new Set<string>()

/**
 * The global router that wraps the application components.
 */
export default function AppRouter({
  initialTree,
  initialCanonicalUrl,
  children,
  hotReloader,
}: {
  initialTree: FlightRouterState
  initialCanonicalUrl: string
  children: ReactNode
  hotReloader?: ReactNode
}) {
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

    // Convert searchParams to a plain object to match server-side.
    const searchParamsObj: { [key: string]: string } = {}
    url.searchParams.forEach((value, key) => {
      searchParamsObj[key] = value
    })
    return { searchParams: searchParamsObj, pathname: url.pathname }
  }, [canonicalUrl])

  /**
   * Server response that only patches the cache and tree.
   */
  const changeByServerResponse = useCallback(
    (previousTree: FlightRouterState, flightData: FlightData) => {
      dispatch({
        type: ACTION_SERVER_PATCH,
        flightData,
        previousTree,
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
      // TODO-APP: implement prefetching of flight
      prefetch: async (href) => {
        // If prefetch has already been triggered, don't trigger it again.
        if (prefetched.has(href)) {
          return
        }

        prefetched.add(href)

        const url = new URL(href, location.origin)
        // TODO-APP: handle case where history.state is not the new router history entry
        const r = fetchServerResponse(
          url,
          // initialTree is used when history.state.tree is missing because the history state is set in `useEffect` below, it being missing means this is the hydration case.
          window.history.state?.tree || initialTree,
          true
        )
        try {
          r.readRoot()
        } catch (e) {
          await e
          const flightData = r.readRoot()
          // @ts-ignore startTransition exists
          React.startTransition(() => {
            dispatch({
              type: ACTION_PREFETCH,
              url,
              flightData,
            })
          })
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
      reload: () => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          dispatch({
            type: ACTION_RELOAD,

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
              <ErrorOverlay>
                {
                  // ErrorOverlay intentionally only wraps the children of app-router.
                  cache.subTreeData
                }
              </ErrorOverlay>
              {
                // HotReloader uses the router tree and router.reload() in order to apply Server Component changes.
                hotReloader
              }
            </LayoutRouterContext.Provider>
          </AppRouterContext.Provider>
        </GlobalLayoutRouterContext.Provider>
      </SearchParamsContext.Provider>
    </PathnameContext.Provider>
  )
}
