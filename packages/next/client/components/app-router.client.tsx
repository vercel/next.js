import React, { useEffect } from 'react'
import { createFromReadableStream } from 'next/dist/compiled/react-server-dom-webpack'
import {
  AppRouterContext,
  AppTreeContext,
  GlobalLayoutRouterContext,
} from '../../shared/lib/app-router-context'
import type {
  CacheNode,
  AppRouterInstance,
} from '../../shared/lib/app-router-context'
import type { FlightRouterState, FlightData } from '../../server/app-render'
import {
  ACTION_NAVIGATE,
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

/**
 * Fetch the flight data for the provided url. Takes in the current router state to decide what to render server-side.
 */
function fetchFlight(
  url: URL,
  flightRouterState: FlightRouterState
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
  flightRouterState: FlightRouterState
): { readRoot: () => FlightData } {
  // Handle the `fetch` readable stream that can be read using `readRoot`.
  return createFromReadableStream(fetchFlight(url, flightRouterState))
}

/**
 * Renders development error overlay when NODE_ENV is development.
 */
function ErrorOverlay({
  children,
}: React.PropsWithChildren<{}>): React.ReactElement {
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

/**
 * The global router that wraps the application components.
 */
export default function AppRouter({
  initialTree,
  initialCanonicalUrl,
  initialStylesheets,
  children,
  hotReloader,
}: {
  initialTree: FlightRouterState
  initialCanonicalUrl: string
  initialStylesheets: string[]
  children: React.ReactNode
  hotReloader?: React.ReactNode
}) {
  const [{ tree, cache, pushRef, focusRef, canonicalUrl }, dispatch] =
    React.useReducer(reducer, {
      tree: initialTree,
      cache: {
        data: null,
        subTreeData: children,
        parallelRoutes:
          typeof window === 'undefined' ? new Map() : initialParallelRoutes,
      },
      pushRef: { pendingPush: false, mpaNavigation: false },
      focusRef: { focus: false },
      canonicalUrl:
        initialCanonicalUrl +
        // Hash is read as the initial value for canonicalUrl in the browser
        // This is safe to do as canonicalUrl can't be rendered, it's only used to control the history updates the useEffect further down.
        (typeof window !== 'undefined' ? window.location.hash : ''),
    })

  useEffect(() => {
    // Ensure initialParallelRoutes is cleaned up from memory once it's used.
    initialParallelRoutes = null!
  }, [])

  // Add memoized pathname/query for useSearchParams and usePathname.
  const { searchParams, pathname } = React.useMemo(() => {
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
  const changeByServerResponse = React.useCallback(
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
      })
    },
    []
  )

  /**
   * The app router that is exposed through `useRouter`. It's only concerned with dispatching actions to the reducer, does not hold state.
   */
  const appRouter = React.useMemo<AppRouterInstance>(() => {
    const navigate = (
      href: string,
      cacheType: 'hard' | 'soft',
      navigateType: 'push' | 'replace'
    ) => {
      return dispatch({
        type: ACTION_NAVIGATE,
        url: new URL(href, location.origin),
        cacheType,
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
            type: ACTION_RELOAD,

            // TODO-APP: revisit if this needs to be passed.
            url: new URL(window.location.href),
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
  }, [])

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
  }, [tree, pushRef, canonicalUrl])

  // Add `window.nd` for debugging purposes.
  // This is not meant for use in applications as concurrent rendering will affect the cache/tree/router.
  if (typeof window !== 'undefined') {
    // @ts-ignore this is for debugging
    window.nd = { router: appRouter, cache, tree }
  }

  /**
   * Handle popstate event, this is used to handle back/forward in the browser.
   * By default dispatches ACTION_RESTORE, however if the history entry was not pushed/replaced by app-router it will reload the page.
   * That case can happen when the old router injected the history entry.
   */
  const onPopState = React.useCallback(({ state }: PopStateEvent) => {
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
  }, [])

  // Register popstate event to call onPopstate.
  React.useEffect(() => {
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
            focusRef,
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
                stylesheets: initialStylesheets,
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
            </AppTreeContext.Provider>
          </AppRouterContext.Provider>
        </GlobalLayoutRouterContext.Provider>
      </SearchParamsContext.Provider>
    </PathnameContext.Provider>
  )
}
