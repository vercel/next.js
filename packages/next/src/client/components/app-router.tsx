'use client'

import type { ReactNode } from 'react'
import React, {
  use,
  useEffect,
  useMemo,
  useCallback,
  startTransition,
  useInsertionEffect,
  useDeferredValue,
} from 'react'
import {
  AppRouterContext,
  LayoutRouterContext,
  GlobalLayoutRouterContext,
  MissingSlotContext,
} from '../../shared/lib/app-router-context.shared-runtime'
import type {
  CacheNode,
  AppRouterInstance,
} from '../../shared/lib/app-router-context.shared-runtime'
import type {
  FlightRouterState,
  FlightData,
} from '../../server/app-render/types'
import type { ErrorComponent } from './error-boundary'
import {
  ACTION_FAST_REFRESH,
  ACTION_NAVIGATE,
  ACTION_PREFETCH,
  ACTION_REFRESH,
  ACTION_RESTORE,
  ACTION_SERVER_ACTION,
  ACTION_SERVER_PATCH,
  PrefetchKind,
} from './router-reducer/router-reducer-types'
import type {
  AppRouterState,
  ReducerActions,
  RouterChangeByServerResponse,
  RouterNavigate,
  ServerActionDispatcher,
} from './router-reducer/router-reducer-types'
import { createHrefFromUrl } from './router-reducer/create-href-from-url'
import {
  SearchParamsContext,
  PathnameContext,
} from '../../shared/lib/hooks-client-context.shared-runtime'
import {
  useReducerWithReduxDevtools,
  useUnwrapState,
  type ReduxDevtoolsSyncFn,
} from './use-reducer-with-devtools'
import { ErrorBoundary } from './error-boundary'
import { createInitialRouterState } from './router-reducer/create-initial-router-state'
import type { InitialRouterStateParameters } from './router-reducer/create-initial-router-state'
import { isBot } from '../../shared/lib/router/utils/is-bot'
import { addBasePath } from '../add-base-path'
import { AppRouterAnnouncer } from './app-router-announcer'
import { RedirectBoundary } from './redirect-boundary'
import { findHeadInCache } from './router-reducer/reducers/find-head-in-cache'
import { createInfinitePromise } from './infinite-promise'
import { NEXT_RSC_UNION_QUERY } from './app-router-headers'
import { removeBasePath } from '../remove-base-path'
import { hasBasePath } from '../has-base-path'
const isServer = typeof window === 'undefined'

// Ensure the initialParallelRoutes are not combined because of double-rendering in the browser with Strict Mode.
let initialParallelRoutes: CacheNode['parallelRoutes'] = isServer
  ? null!
  : new Map()

let globalServerActionDispatcher = null as ServerActionDispatcher | null

export function getServerActionDispatcher() {
  return globalServerActionDispatcher
}

const globalMutable: {
  pendingMpaPath?: string
} = {}

export function urlToUrlWithoutFlightMarker(url: string): URL {
  const urlWithoutFlightParameters = new URL(url, location.origin)
  urlWithoutFlightParameters.searchParams.delete(NEXT_RSC_UNION_QUERY)
  if (process.env.NODE_ENV === 'production') {
    if (
      process.env.__NEXT_CONFIG_OUTPUT === 'export' &&
      urlWithoutFlightParameters.pathname.endsWith('.txt')
    ) {
      const { pathname } = urlWithoutFlightParameters
      const length = pathname.endsWith('/index.txt') ? 10 : 4
      // Slice off `/index.txt` or `.txt` from the end of the pathname
      urlWithoutFlightParameters.pathname = pathname.slice(0, -length)
    }
  }
  return urlWithoutFlightParameters
}

type AppRouterProps = Omit<
  Omit<InitialRouterStateParameters, 'isServer' | 'location'>,
  'initialParallelRoutes'
> & {
  buildId: string
  initialHead: ReactNode
  assetPrefix: string
  missingSlots: Set<string>
}

function isExternalURL(url: URL) {
  return url.origin !== window.location.origin
}

function HistoryUpdater({
  appRouterState,
  sync,
}: {
  appRouterState: AppRouterState
  sync: ReduxDevtoolsSyncFn
}) {
  useInsertionEffect(() => {
    const { tree, pushRef, canonicalUrl } = appRouterState
    const historyState = {
      ...(pushRef.preserveCustomHistoryState ? window.history.state : {}),
      // Identifier is shortened intentionally.
      // __NA is used to identify if the history entry can be handled by the app-router.
      // __N is used to identify if the history entry can be handled by the old router.
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: tree,
    }
    if (
      pushRef.pendingPush &&
      // Skip pushing an additional history entry if the canonicalUrl is the same as the current url.
      // This mirrors the browser behavior for normal navigation.
      createHrefFromUrl(new URL(window.location.href)) !== canonicalUrl
    ) {
      // This intentionally mutates React state, pushRef is overwritten to ensure additional push/replace calls do not trigger an additional history entry.
      pushRef.pendingPush = false
      window.history.pushState(historyState, '', canonicalUrl)
    } else {
      window.history.replaceState(historyState, '', canonicalUrl)
    }

    sync(appRouterState)
  }, [appRouterState, sync])
  return null
}

export function createEmptyCacheNode(): CacheNode {
  return {
    lazyData: null,
    rsc: null,
    prefetchRsc: null,
    parallelRoutes: new Map(),
  }
}

function useServerActionDispatcher(dispatch: React.Dispatch<ReducerActions>) {
  const serverActionDispatcher: ServerActionDispatcher = useCallback(
    (actionPayload) => {
      startTransition(() => {
        dispatch({
          ...actionPayload,
          type: ACTION_SERVER_ACTION,
        })
      })
    },
    [dispatch]
  )
  globalServerActionDispatcher = serverActionDispatcher
}

/**
 * Server response that only patches the cache and tree.
 */
function useChangeByServerResponse(
  dispatch: React.Dispatch<ReducerActions>
): RouterChangeByServerResponse {
  return useCallback(
    (
      previousTree: FlightRouterState,
      flightData: FlightData,
      overrideCanonicalUrl: URL | undefined
    ) => {
      startTransition(() => {
        dispatch({
          type: ACTION_SERVER_PATCH,
          flightData,
          previousTree,
          overrideCanonicalUrl,
        })
      })
    },
    [dispatch]
  )
}

function useNavigate(dispatch: React.Dispatch<ReducerActions>): RouterNavigate {
  return useCallback(
    (href, navigateType, shouldScroll) => {
      const url = new URL(addBasePath(href), location.href)

      return dispatch({
        type: ACTION_NAVIGATE,
        url,
        isExternalUrl: isExternalURL(url),
        locationSearch: location.search,
        shouldScroll: shouldScroll ?? true,
        navigateType,
      })
    },
    [dispatch]
  )
}

function copyNextJsInternalHistoryState(data: any) {
  if (data == null) data = {}
  const currentState = window.history.state
  const __NA = currentState?.__NA
  if (__NA) {
    data.__NA = __NA
  }
  const __PRIVATE_NEXTJS_INTERNALS_TREE =
    currentState?.__PRIVATE_NEXTJS_INTERNALS_TREE
  if (__PRIVATE_NEXTJS_INTERNALS_TREE) {
    data.__PRIVATE_NEXTJS_INTERNALS_TREE = __PRIVATE_NEXTJS_INTERNALS_TREE
  }

  return data
}

function Head({
  headCacheNode,
}: {
  headCacheNode: CacheNode | null
}): React.ReactNode {
  // If this segment has a `prefetchHead`, it's the statically prefetched data.
  // We should use that on initial render instead of `head`. Then we'll switch
  // to `head` when the dynamic response streams in.
  const head = headCacheNode !== null ? headCacheNode.head : null
  const prefetchHead =
    headCacheNode !== null ? headCacheNode.prefetchHead : null

  // If no prefetch data is available, then we go straight to rendering `head`.
  const resolvedPrefetchRsc = prefetchHead !== null ? prefetchHead : head

  // We use `useDeferredValue` to handle switching between the prefetched and
  // final values. The second argument is returned on initial render, then it
  // re-renders with the first argument.
  //
  // @ts-expect-error The second argument to `useDeferredValue` is only
  // available in the experimental builds. When its disabled, it will always
  // return `head`.
  return useDeferredValue(head, resolvedPrefetchRsc)
}

/**
 * The global router that wraps the application components.
 */
function Router({
  buildId,
  initialHead,
  initialTree,
  initialCanonicalUrl,
  initialSeedData,
  assetPrefix,
  missingSlots,
}: AppRouterProps) {
  const initialState = useMemo(
    () =>
      createInitialRouterState({
        buildId,
        initialSeedData,
        initialCanonicalUrl,
        initialTree,
        initialParallelRoutes,
        isServer,
        location: !isServer ? window.location : null,
        initialHead,
      }),
    [buildId, initialSeedData, initialCanonicalUrl, initialTree, initialHead]
  )
  const [reducerState, dispatch, sync] =
    useReducerWithReduxDevtools(initialState)

  useEffect(() => {
    // Ensure initialParallelRoutes is cleaned up from memory once it's used.
    initialParallelRoutes = null!
  }, [])

  const { canonicalUrl } = useUnwrapState(reducerState)
  // Add memoized pathname/query for useSearchParams and usePathname.
  const { searchParams, pathname } = useMemo(() => {
    const url = new URL(
      canonicalUrl,
      typeof window === 'undefined' ? 'http://n' : window.location.href
    )

    return {
      // This is turned into a readonly class in `useSearchParams`
      searchParams: url.searchParams,
      pathname: hasBasePath(url.pathname)
        ? removeBasePath(url.pathname)
        : url.pathname,
    }
  }, [canonicalUrl])

  const changeByServerResponse = useChangeByServerResponse(dispatch)
  const navigate = useNavigate(dispatch)
  useServerActionDispatcher(dispatch)

  /**
   * The app router that is exposed through `useRouter`. It's only concerned with dispatching actions to the reducer, does not hold state.
   */
  const appRouter = useMemo<AppRouterInstance>(() => {
    const routerInstance: AppRouterInstance = {
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      prefetch: (href, options) => {
        // Don't prefetch for bots as they don't navigate.
        // Don't prefetch during development (improves compilation performance)
        if (
          isBot(window.navigator.userAgent) ||
          process.env.NODE_ENV === 'development'
        ) {
          return
        }
        const url = new URL(addBasePath(href), window.location.href)
        // External urls can't be prefetched in the same way.
        if (isExternalURL(url)) {
          return
        }
        startTransition(() => {
          dispatch({
            type: ACTION_PREFETCH,
            url,
            kind: options?.kind ?? PrefetchKind.FULL,
          })
        })
      },
      replace: (href, options = {}) => {
        startTransition(() => {
          navigate(href, 'replace', options.scroll ?? true)
        })
      },
      push: (href, options = {}) => {
        startTransition(() => {
          navigate(href, 'push', options.scroll ?? true)
        })
      },
      refresh: () => {
        startTransition(() => {
          dispatch({
            type: ACTION_REFRESH,
            origin: window.location.origin,
          })
        })
      },
      // @ts-ignore we don't want to expose this method at all
      fastRefresh: () => {
        if (process.env.NODE_ENV !== 'development') {
          throw new Error(
            'fastRefresh can only be used in development mode. Please use refresh instead.'
          )
        } else {
          startTransition(() => {
            dispatch({
              type: ACTION_FAST_REFRESH,
              origin: window.location.origin,
            })
          })
        }
      },
    }

    return routerInstance
  }, [dispatch, navigate])

  useEffect(() => {
    // Exists for debugging purposes. Don't use in application code.
    if (window.next) {
      window.next.router = appRouter
    }
  }, [appRouter])

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { cache, prefetchCache, tree } = useUnwrapState(reducerState)

    // This hook is in a conditional but that is ok because `process.env.NODE_ENV` never changes
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      // Add `window.nd` for debugging purposes.
      // This is not meant for use in applications as concurrent rendering will affect the cache/tree/router.
      // @ts-ignore this is for debugging
      window.nd = {
        router: appRouter,
        cache,
        prefetchCache,
        tree,
      }
    }, [appRouter, cache, prefetchCache, tree])
  }

  useEffect(() => {
    // If the app is restored from bfcache, it's possible that
    // pushRef.mpaNavigation is true, which would mean that any re-render of this component
    // would trigger the mpa navigation logic again from the lines below.
    // This will restore the router to the initial state in the event that the app is restored from bfcache.
    function handlePageShow(event: PageTransitionEvent) {
      if (
        !event.persisted ||
        !window.history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE
      ) {
        return
      }

      dispatch({
        type: ACTION_RESTORE,
        url: new URL(window.location.href),
        tree: window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE,
      })
    }

    window.addEventListener('pageshow', handlePageShow)

    return () => {
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [dispatch])

  // When mpaNavigation flag is set do a hard navigation to the new url.
  // Infinitely suspend because we don't actually want to rerender any child
  // components with the new URL and any entangled state updates shouldn't
  // commit either (eg: useTransition isPending should stay true until the page
  // unloads).
  //
  // This is a side effect in render. Don't try this at home, kids. It's
  // probably safe because we know this is a singleton component and it's never
  // in <Offscreen>. At least I hope so. (It will run twice in dev strict mode,
  // but that's... fine?)
  const { pushRef } = useUnwrapState(reducerState)
  if (pushRef.mpaNavigation) {
    // if there's a re-render, we don't want to trigger another redirect if one is already in flight to the same URL
    if (globalMutable.pendingMpaPath !== canonicalUrl) {
      const location = window.location
      if (pushRef.pendingPush) {
        location.assign(canonicalUrl)
      } else {
        location.replace(canonicalUrl)
      }

      globalMutable.pendingMpaPath = canonicalUrl
    }
    // TODO-APP: Should we listen to navigateerror here to catch failed
    // navigations somehow? And should we call window.stop() if a SPA navigation
    // should interrupt an MPA one?
    use(createInfinitePromise())
  }

  useEffect(() => {
    const originalPushState = window.history.pushState.bind(window.history)
    const originalReplaceState = window.history.replaceState.bind(
      window.history
    )

    // Ensure the canonical URL in the Next.js Router is updated when the URL is changed so that `usePathname` and `useSearchParams` hold the pushed values.
    const applyUrlFromHistoryPushReplace = (
      url: string | URL | null | undefined
    ) => {
      const href = window.location.href
      startTransition(() => {
        dispatch({
          type: ACTION_RESTORE,
          url: new URL(url ?? href, href),
          tree: window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE,
        })
      })
    }

    /**
     * Patch pushState to ensure external changes to the history are reflected in the Next.js Router.
     * Ensures Next.js internal history state is copied to the new history entry.
     * Ensures usePathname and useSearchParams hold the newly provided url.
     */
    window.history.pushState = function pushState(
      data: any,
      _unused: string,
      url?: string | URL | null
    ): void {
      // Avoid a loop when Next.js internals trigger pushState/replaceState
      if (data?.__NA || data?._N) {
        return originalPushState(data, _unused, url)
      }
      data = copyNextJsInternalHistoryState(data)

      if (url) {
        applyUrlFromHistoryPushReplace(url)
      }

      return originalPushState(data, _unused, url)
    }

    /**
     * Patch replaceState to ensure external changes to the history are reflected in the Next.js Router.
     * Ensures Next.js internal history state is copied to the new history entry.
     * Ensures usePathname and useSearchParams hold the newly provided url.
     */
    window.history.replaceState = function replaceState(
      data: any,
      _unused: string,
      url?: string | URL | null
    ): void {
      // Avoid a loop when Next.js internals trigger pushState/replaceState
      if (data?.__NA || data?._N) {
        return originalReplaceState(data, _unused, url)
      }
      data = copyNextJsInternalHistoryState(data)

      if (url) {
        applyUrlFromHistoryPushReplace(url)
      }
      return originalReplaceState(data, _unused, url)
    }

    /**
     * Handle popstate event, this is used to handle back/forward in the browser.
     * By default dispatches ACTION_RESTORE, however if the history entry was not pushed/replaced by app-router it will reload the page.
     * That case can happen when the old router injected the history entry.
     */
    const onPopState = ({ state }: PopStateEvent) => {
      if (!state) {
        // TODO-APP: this case only happens when pushState/replaceState was called outside of Next.js. It should probably reload the page in this case.
        return
      }

      // This case happens when the history entry was pushed by the `pages` router.
      if (!state.__NA) {
        window.location.reload()
        return
      }

      // @ts-ignore useTransition exists
      // TODO-APP: Ideally the back button should not use startTransition as it should apply the updates synchronously
      // Without startTransition works if the cache is there for this path
      startTransition(() => {
        dispatch({
          type: ACTION_RESTORE,
          url: new URL(window.location.href),
          tree: state.__PRIVATE_NEXTJS_INTERNALS_TREE,
        })
      })
    }

    // Register popstate event to call onPopstate.
    window.addEventListener('popstate', onPopState)
    return () => {
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
      window.removeEventListener('popstate', onPopState)
    }
  }, [dispatch])

  const { cache, tree, nextUrl, focusAndScrollRef } =
    useUnwrapState(reducerState)

  const matchingHead = useMemo(() => {
    return findHeadInCache(cache, tree[1])
  }, [cache, tree])

  let head
  if (matchingHead !== null) {
    // The head is wrapped in an extra component so we can use
    // `useDeferredValue` to swap between the prefetched and final versions of
    // the head. (This is what LayoutRouter does for segment data, too.)
    //
    // The `key` is used to remount the component whenever the head moves to
    // a different segment.
    const [headCacheNode, headKey] = matchingHead
    head = <Head key={headKey} headCacheNode={headCacheNode} />
  } else {
    head = null
  }

  let content = (
    <RedirectBoundary>
      {head}
      {cache.rsc}
      <AppRouterAnnouncer tree={tree} />
    </RedirectBoundary>
  )

  if (process.env.NODE_ENV !== 'production') {
    if (typeof window !== 'undefined') {
      const DevRootNotFoundBoundary: typeof import('./dev-root-not-found-boundary').DevRootNotFoundBoundary =
        require('./dev-root-not-found-boundary').DevRootNotFoundBoundary
      content = (
        <DevRootNotFoundBoundary>
          <MissingSlotContext.Provider value={missingSlots}>
            {content}
          </MissingSlotContext.Provider>
        </DevRootNotFoundBoundary>
      )
    }
    const HotReloader: typeof import('./react-dev-overlay/hot-reloader-client').default =
      require('./react-dev-overlay/hot-reloader-client').default

    content = <HotReloader assetPrefix={assetPrefix}>{content}</HotReloader>
  }

  return (
    <>
      <HistoryUpdater
        appRouterState={useUnwrapState(reducerState)}
        sync={sync}
      />
      <PathnameContext.Provider value={pathname}>
        <SearchParamsContext.Provider value={searchParams}>
          <GlobalLayoutRouterContext.Provider
            value={{
              buildId,
              changeByServerResponse,
              tree,
              focusAndScrollRef,
              nextUrl,
            }}
          >
            <AppRouterContext.Provider value={appRouter}>
              <LayoutRouterContext.Provider
                value={{
                  childNodes: cache.parallelRoutes,
                  tree,
                  // Root node always has `url`
                  // Provided in AppTreeContext to ensure it can be overwritten in layout-router
                  url: canonicalUrl,
                }}
              >
                {content}
              </LayoutRouterContext.Provider>
            </AppRouterContext.Provider>
          </GlobalLayoutRouterContext.Provider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </>
  )
}

export default function AppRouter(
  props: AppRouterProps & { globalErrorComponent: ErrorComponent }
) {
  const { globalErrorComponent, ...rest } = props

  return (
    <ErrorBoundary errorComponent={globalErrorComponent}>
      <Router {...rest} />
    </ErrorBoundary>
  )
}
