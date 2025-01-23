'use client'

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
} from '../../shared/lib/app-router-context.shared-runtime'
import type {
  CacheNode,
  AppRouterInstance,
} from '../../shared/lib/app-router-context.shared-runtime'
import {
  ACTION_HMR_REFRESH,
  ACTION_NAVIGATE,
  ACTION_PREFETCH,
  ACTION_REFRESH,
  ACTION_RESTORE,
  ACTION_SERVER_PATCH,
  PrefetchKind,
} from './router-reducer/router-reducer-types'
import type {
  AppRouterState,
  ReducerActions,
  RouterChangeByServerResponse,
  RouterNavigate,
} from './router-reducer/router-reducer-types'
import { createHrefFromUrl } from './router-reducer/create-href-from-url'
import {
  SearchParamsContext,
  PathnameContext,
  PathParamsContext,
} from '../../shared/lib/hooks-client-context.shared-runtime'
import { useReducer, useUnwrapState } from './use-reducer'
import {
  ErrorBoundary,
  type ErrorComponent,
  type GlobalErrorComponent,
} from './error-boundary'
import { isBot } from '../../shared/lib/router/utils/is-bot'
import { addBasePath } from '../add-base-path'
import { AppRouterAnnouncer } from './app-router-announcer'
import { RedirectBoundary } from './redirect-boundary'
import { findHeadInCache } from './router-reducer/reducers/find-head-in-cache'
import { unresolvedThenable } from './unresolved-thenable'
import { removeBasePath } from '../remove-base-path'
import { hasBasePath } from '../has-base-path'
import { getSelectedParams } from './router-reducer/compute-changed-path'
import type { FlightRouterState } from '../../server/app-render/types'
import { useNavFailureHandler } from './nav-failure-handler'
import { useServerActionDispatcher } from '../app-call-server'
import type { AppRouterActionQueue } from '../../shared/lib/router/action-queue'
import { prefetch as prefetchWithSegmentCache } from '../components/segment-cache/prefetch'
import { getRedirectTypeFromError, getURLFromRedirectError } from './redirect'
import { isRedirectError, RedirectType } from './redirect-error'
import { prefetchReducer } from './router-reducer/reducers/prefetch-reducer'

const globalMutable: {
  pendingMpaPath?: string
} = {}

function isExternalURL(url: URL) {
  return url.origin !== window.location.origin
}

/**
 * Given a link href, constructs the URL that should be prefetched. Returns null
 * in cases where prefetching should be disabled, like external URLs, or
 * during development.
 * @param href The href passed to <Link>, router.prefetch(), or similar
 * @returns A URL object to prefetch, or null if prefetching should be disabled
 */
export function createPrefetchURL(href: string): URL | null {
  // Don't prefetch for bots as they don't navigate.
  if (isBot(window.navigator.userAgent)) {
    return null
  }

  let url: URL
  try {
    url = new URL(addBasePath(href), window.location.href)
  } catch (_) {
    // TODO: Does this need to throw or can we just console.error instead? Does
    // anyone rely on this throwing? (Seems unlikely.)
    throw new Error(
      `Cannot prefetch '${href}' because it cannot be converted to a URL.`
    )
  }

  // Don't prefetch during development (improves compilation performance)
  if (process.env.NODE_ENV === 'development') {
    return null
  }

  // External urls can't be prefetched in the same way.
  if (isExternalURL(url)) {
    return null
  }

  return url
}

function HistoryUpdater({
  appRouterState,
}: {
  appRouterState: AppRouterState
}) {
  useInsertionEffect(() => {
    if (process.env.__NEXT_APP_NAV_FAIL_HANDLING) {
      // clear pending URL as navigation is no longer
      // in flight
      window.next.__pendingUrl = undefined
    }

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
  }, [appRouterState])
  return null
}

export function createEmptyCacheNode(): CacheNode {
  return {
    lazyData: null,
    rsc: null,
    prefetchRsc: null,
    head: null,
    prefetchHead: null,
    parallelRoutes: new Map(),
    loading: null,
  }
}

/**
 * Server response that only patches the cache and tree.
 */
function useChangeByServerResponse(
  dispatch: React.Dispatch<ReducerActions>
): RouterChangeByServerResponse {
  return useCallback(
    ({ previousTree, serverResponse }) => {
      startTransition(() => {
        dispatch({
          type: ACTION_SERVER_PATCH,
          previousTree,
          serverResponse,
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

      if (process.env.__NEXT_APP_NAV_FAIL_HANDLING) {
        window.next.__pendingUrl = url
      }

      return dispatch({
        type: ACTION_NAVIGATE,
        url,
        isExternalUrl: isExternalURL(url),
        locationSearch: location.search,
        shouldScroll: shouldScroll ?? true,
        navigateType,
        allowAliasing: true,
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
  return useDeferredValue(head, resolvedPrefetchRsc)
}

/**
 * The global router that wraps the application components.
 */
function Router({
  actionQueue,
  assetPrefix,
  globalError,
}: {
  actionQueue: AppRouterActionQueue
  assetPrefix: string
  globalError: [GlobalErrorComponent, React.ReactNode]
}) {
  const [state, dispatch] = useReducer(actionQueue)
  const { canonicalUrl } = useUnwrapState(state)
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
      prefetch: process.env.__NEXT_CLIENT_SEGMENT_CACHE
        ? // Unlike the old implementation, the Segment Cache doesn't store its
          // data in the router reducer state; it writes into a global mutable
          // cache. So we don't need to dispatch an action.
          (href, options) =>
            prefetchWithSegmentCache(
              href,
              actionQueue.state.nextUrl,
              actionQueue.state.tree,
              options?.kind === PrefetchKind.FULL
            )
        : (href, options) => {
            // Use the old prefetch implementation.
            const url = createPrefetchURL(href)
            if (url !== null) {
              // The prefetch reducer doesn't actually update any state or
              // trigger a rerender. It just writes to a mutable cache. So we
              // shouldn't bother calling setState/dispatch; we can just re-run
              // the reducer directly using the current state.
              // TODO: Refactor this away from a "reducer" so it's
              // less confusing.
              prefetchReducer(actionQueue.state, {
                type: ACTION_PREFETCH,
                url,
                kind: options?.kind ?? PrefetchKind.FULL,
              })
            }
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
      hmrRefresh: () => {
        if (process.env.NODE_ENV !== 'development') {
          throw new Error(
            'hmrRefresh can only be used in development mode. Please use refresh instead.'
          )
        } else {
          startTransition(() => {
            dispatch({
              type: ACTION_HMR_REFRESH,
              origin: window.location.origin,
            })
          })
        }
      },
    }

    return routerInstance
  }, [actionQueue, dispatch, navigate])

  useEffect(() => {
    // Exists for debugging purposes. Don't use in application code.
    if (window.next) {
      window.next.router = appRouter
    }
  }, [appRouter])

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { cache, prefetchCache, tree } = useUnwrapState(state)

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

      // Clear the pendingMpaPath value so that a subsequent MPA navigation to the same URL can be triggered.
      // This is necessary because if the browser restored from bfcache, the pendingMpaPath would still be set to the value
      // of the last MPA navigation.
      globalMutable.pendingMpaPath = undefined

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

  useEffect(() => {
    // Ensure that any redirect errors that bubble up outside of the RedirectBoundary
    // are caught and handled by the router.
    function handleUnhandledRedirect(
      event: ErrorEvent | PromiseRejectionEvent
    ) {
      const error = 'reason' in event ? event.reason : event.error
      if (isRedirectError(error)) {
        event.preventDefault()
        const url = getURLFromRedirectError(error)
        const redirectType = getRedirectTypeFromError(error)
        if (redirectType === RedirectType.push) {
          appRouter.push(url, {})
        } else {
          appRouter.replace(url, {})
        }
      }
    }
    window.addEventListener('error', handleUnhandledRedirect)
    window.addEventListener('unhandledrejection', handleUnhandledRedirect)

    return () => {
      window.removeEventListener('error', handleUnhandledRedirect)
      window.removeEventListener('unhandledrejection', handleUnhandledRedirect)
    }
  }, [appRouter])

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
  const { pushRef } = useUnwrapState(state)
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
    use(unresolvedThenable)
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
      const tree: FlightRouterState | undefined =
        window.history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE

      startTransition(() => {
        dispatch({
          type: ACTION_RESTORE,
          url: new URL(url ?? href, href),
          tree,
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
    const onPopState = (event: PopStateEvent) => {
      if (!event.state) {
        // TODO-APP: this case only happens when pushState/replaceState was called outside of Next.js. It should probably reload the page in this case.
        return
      }

      // This case happens when the history entry was pushed by the `pages` router.
      if (!event.state.__NA) {
        window.location.reload()
        return
      }

      // TODO-APP: Ideally the back button should not use startTransition as it should apply the updates synchronously
      // Without startTransition works if the cache is there for this path
      startTransition(() => {
        dispatch({
          type: ACTION_RESTORE,
          url: new URL(window.location.href),
          tree: event.state.__PRIVATE_NEXTJS_INTERNALS_TREE,
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

  const { cache, tree, nextUrl, focusAndScrollRef } = useUnwrapState(state)

  const matchingHead = useMemo(() => {
    return findHeadInCache(cache, tree[1])
  }, [cache, tree])

  // Add memoized pathParams for useParams.
  const pathParams = useMemo(() => {
    return getSelectedParams(tree)
  }, [tree])

  const layoutRouterContext = useMemo(() => {
    return {
      parentTree: tree,
      parentCacheNode: cache,
      parentSegmentPath: null,
      // Root node always has `url`
      // Provided in AppTreeContext to ensure it can be overwritten in layout-router
      url: canonicalUrl,
    }
  }, [tree, cache, canonicalUrl])

  const globalLayoutRouterContext = useMemo(() => {
    return {
      changeByServerResponse,
      tree,
      focusAndScrollRef,
      nextUrl,
    }
  }, [changeByServerResponse, tree, focusAndScrollRef, nextUrl])

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
      const { DevRootHTTPAccessFallbackBoundary } =
        require('./dev-root-http-access-fallback-boundary') as typeof import('./dev-root-http-access-fallback-boundary')
      content = (
        <DevRootHTTPAccessFallbackBoundary>
          {content}
        </DevRootHTTPAccessFallbackBoundary>
      )
    }
    const HotReloader: typeof import('./react-dev-overlay/app/hot-reloader-client').default =
      require('./react-dev-overlay/app/hot-reloader-client').default

    content = (
      <HotReloader assetPrefix={assetPrefix} globalError={globalError}>
        {content}
      </HotReloader>
    )
  }

  return (
    <>
      <HistoryUpdater appRouterState={useUnwrapState(state)} />
      <RuntimeStyles />
      <PathParamsContext.Provider value={pathParams}>
        <PathnameContext.Provider value={pathname}>
          <SearchParamsContext.Provider value={searchParams}>
            <GlobalLayoutRouterContext.Provider
              value={globalLayoutRouterContext}
            >
              <AppRouterContext.Provider value={appRouter}>
                <LayoutRouterContext.Provider value={layoutRouterContext}>
                  {content}
                </LayoutRouterContext.Provider>
              </AppRouterContext.Provider>
            </GlobalLayoutRouterContext.Provider>
          </SearchParamsContext.Provider>
        </PathnameContext.Provider>
      </PathParamsContext.Provider>
    </>
  )
}

export default function AppRouter({
  actionQueue,
  globalErrorComponentAndStyles: [globalErrorComponent, globalErrorStyles],
  assetPrefix,
}: {
  actionQueue: AppRouterActionQueue
  globalErrorComponentAndStyles: [GlobalErrorComponent, React.ReactNode]
  assetPrefix: string
}) {
  useNavFailureHandler()

  return (
    <ErrorBoundary
      // globalErrorComponent doesn't need `reset`, we do a type cast here to fit the ErrorBoundary type
      errorComponent={globalErrorComponent as ErrorComponent}
      errorStyles={globalErrorStyles}
    >
      <Router
        actionQueue={actionQueue}
        assetPrefix={assetPrefix}
        globalError={[globalErrorComponent, globalErrorStyles]}
      />
    </ErrorBoundary>
  )
}

const runtimeStyles = new Set<string>()
let runtimeStyleChanged = new Set<() => void>()

globalThis._N_E_STYLE_LOAD = function (href: string) {
  let len = runtimeStyles.size
  runtimeStyles.add(href)
  if (runtimeStyles.size !== len) {
    runtimeStyleChanged.forEach((cb) => cb())
  }
  // TODO figure out how to get a promise here
  // But maybe it's not necessary as react would block rendering until it's loaded
  return Promise.resolve()
}

function RuntimeStyles() {
  const [, forceUpdate] = React.useState(0)
  const renderedStylesSize = runtimeStyles.size
  useEffect(() => {
    const changed = () => forceUpdate((c) => c + 1)
    runtimeStyleChanged.add(changed)
    if (renderedStylesSize !== runtimeStyles.size) {
      changed()
    }
    return () => {
      runtimeStyleChanged.delete(changed)
    }
  }, [renderedStylesSize, forceUpdate])

  const dplId = process.env.NEXT_DEPLOYMENT_ID
    ? `?dpl=${process.env.NEXT_DEPLOYMENT_ID}`
    : ''
  return [...runtimeStyles].map((href, i) => (
    <link
      key={i}
      rel="stylesheet"
      href={`${href}${dplId}`}
      // @ts-ignore
      precedence="next"
      // TODO figure out crossOrigin and nonce
      // crossOrigin={TODO}
      // nonce={TODO}
    />
  ))
}
