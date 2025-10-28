import React, {
  useEffect,
  useMemo,
  startTransition,
  useInsertionEffect,
  useDeferredValue,
} from 'react'
import {
  AppRouterContext,
  LayoutRouterContext,
  GlobalLayoutRouterContext,
} from '../../shared/lib/app-router-context.shared-runtime'
import type { CacheNode } from '../../shared/lib/app-router-types'
import { ACTION_RESTORE } from './router-reducer/router-reducer-types'
import type {
  AppHistoryState,
  AppRouterState,
} from './router-reducer/router-reducer-types'
import { createHrefFromUrl } from './router-reducer/create-href-from-url'
import {
  SearchParamsContext,
  PathnameContext,
  PathParamsContext,
  NavigationPromisesContext,
  type NavigationPromises,
} from '../../shared/lib/hooks-client-context.shared-runtime'
import { dispatchAppRouterAction, useActionQueue } from './use-action-queue'
import { AppRouterAnnouncer } from './app-router-announcer'
import { RedirectBoundary } from './redirect-boundary'
import { findHeadInCache } from './router-reducer/reducers/find-head-in-cache'
import { unresolvedThenable } from './unresolved-thenable'
import { removeBasePath } from '../remove-base-path'
import { hasBasePath } from '../has-base-path'
import { getSelectedParams } from './router-reducer/compute-changed-path'
import { useNavFailureHandler } from './nav-failure-handler'
import {
  dispatchTraverseAction,
  publicAppRouterInstance,
  type AppRouterActionQueue,
  type GlobalErrorState,
} from './app-router-instance'
import { getRedirectTypeFromError, getURLFromRedirectError } from './redirect'
import { isRedirectError, RedirectType } from './redirect-error'
import { pingVisibleLinks } from './links'
import RootErrorBoundary from './errors/root-error-boundary'
import DefaultGlobalError from './builtin/global-error'
import { RootLayoutBoundary } from '../../lib/framework/boundary-components'
import type { StaticIndicatorState } from '../dev/hot-reloader/app/hot-reloader-app'

const globalMutable: {
  pendingMpaPath?: string
} = {}

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

    const { tree, pushRef, canonicalUrl, renderedSearch } = appRouterState

    const appHistoryState: AppHistoryState = {
      tree,
      renderedSearch,
    }

    const historyState = {
      ...(pushRef.preserveCustomHistoryState ? window.history.state : {}),
      // Identifier is shortened intentionally.
      // __NA is used to identify if the history entry can be handled by the app-router.
      // __N is used to identify if the history entry can be handled by the old router.
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: appHistoryState,
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

  useEffect(() => {
    // The Next-Url and the base tree may affect the result of a prefetch
    // task. Re-prefetch all visible links with the updated values. In most
    // cases, this will not result in any new network requests, only if
    // the prefetch result actually varies on one of these inputs.
    if (process.env.__NEXT_CLIENT_SEGMENT_CACHE) {
      pingVisibleLinks(appRouterState.nextUrl, appRouterState.tree)
    }
  }, [appRouterState.nextUrl, appRouterState.tree])

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
    navigatedAt: -1,
  }
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
  globalError,
  webSocket,
  staticIndicatorState,
}: {
  actionQueue: AppRouterActionQueue
  globalError: GlobalErrorState
  webSocket: WebSocket | undefined
  staticIndicatorState: StaticIndicatorState | undefined
}) {
  const state = useActionQueue(actionQueue)
  const { canonicalUrl } = state
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

  if (process.env.NODE_ENV !== 'production') {
    const { cache, tree } = state

    // This hook is in a conditional but that is ok because `process.env.NODE_ENV` never changes
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      // Add `window.nd` for debugging purposes.
      // This is not meant for use in applications as concurrent rendering will affect the cache/tree/router.
      // @ts-ignore this is for debugging
      window.nd = {
        router: publicAppRouterInstance,
        cache,
        tree,
      }
    }, [cache, tree])
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

      dispatchAppRouterAction({
        type: ACTION_RESTORE,
        url: new URL(window.location.href),
        historyState: window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE,
      })
    }

    window.addEventListener('pageshow', handlePageShow)

    return () => {
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

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
        // TODO: This should access the router methods directly, rather than
        // go through the public interface.
        if (redirectType === RedirectType.push) {
          publicAppRouterInstance.push(url, {})
        } else {
          publicAppRouterInstance.replace(url, {})
        }
      }
    }
    window.addEventListener('error', handleUnhandledRedirect)
    window.addEventListener('unhandledrejection', handleUnhandledRedirect)

    return () => {
      window.removeEventListener('error', handleUnhandledRedirect)
      window.removeEventListener('unhandledrejection', handleUnhandledRedirect)
    }
  }, [])

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
  const { pushRef } = state
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
    // NOTE: This is intentionally using `throw` instead of `use` because we're
    // inside an externally mutable condition (pushRef.mpaNavigation), which
    // violates the rules of hooks.
    throw unresolvedThenable
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
      const appHistoryState: AppHistoryState | undefined =
        window.history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE

      startTransition(() => {
        dispatchAppRouterAction({
          type: ACTION_RESTORE,
          url: new URL(url ?? href, href),
          historyState: appHistoryState,
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
        dispatchTraverseAction(
          window.location.href,
          event.state.__PRIVATE_NEXTJS_INTERNALS_TREE
        )
      })
    }

    // Register popstate event to call onPopstate.
    window.addEventListener('popstate', onPopState)
    return () => {
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  const { cache, tree, nextUrl, focusAndScrollRef, previousNextUrl } = state

  const matchingHead = useMemo(() => {
    return findHeadInCache(cache, tree[1])
  }, [cache, tree])

  // Add memoized pathParams for useParams.
  const pathParams = useMemo(() => {
    return getSelectedParams(tree)
  }, [tree])

  // Create instrumented promises for navigation hooks (dev-only)
  // These are specially instrumented promises to show in the Suspense DevTools
  // Promises are cached outside of render to survive suspense retries.
  let instrumentedNavigationPromises: NavigationPromises | null = null
  if (process.env.NODE_ENV !== 'production') {
    const { createRootNavigationPromises } =
      require('./navigation-devtools') as typeof import('./navigation-devtools')

    instrumentedNavigationPromises = createRootNavigationPromises(
      tree,
      pathname,
      searchParams,
      pathParams
    )
  }

  const layoutRouterContext = useMemo(() => {
    return {
      parentTree: tree,
      parentCacheNode: cache,
      parentSegmentPath: null,
      parentParams: {},
      // This is the <Activity> "name" that shows up in the Suspense DevTools.
      // It represents the root of the app.
      debugNameContext: '/',
      // Root node always has `url`
      // Provided in AppTreeContext to ensure it can be overwritten in layout-router
      url: canonicalUrl,
      // Root segment is always active
      isActive: true,
    }
  }, [tree, cache, canonicalUrl])

  const globalLayoutRouterContext = useMemo(() => {
    return {
      tree,
      focusAndScrollRef,
      nextUrl,
      previousNextUrl,
    }
  }, [tree, focusAndScrollRef, nextUrl, previousNextUrl])

  let head
  if (matchingHead !== null) {
    // The head is wrapped in an extra component so we can use
    // `useDeferredValue` to swap between the prefetched and final versions of
    // the head. (This is what LayoutRouter does for segment data, too.)
    //
    // The `key` is used to remount the component whenever the head moves to
    // a different segment.
    const [headCacheNode, headKey, headKeyWithoutSearchParams] = matchingHead

    head = (
      <Head
        key={
          // Necessary for PPR: omit search params from the key to match prerendered keys
          typeof window === 'undefined' ? headKeyWithoutSearchParams : headKey
        }
        headCacheNode={headCacheNode}
      />
    )
  } else {
    head = null
  }

  let content = (
    <RedirectBoundary>
      {head}
      {/* RootLayoutBoundary enables detection of Suspense boundaries around the root layout.
          When users wrap their layout in <Suspense>, this creates the component stack pattern
          "Suspense -> RootLayoutBoundary" which dynamic-rendering.ts uses to allow dynamic rendering. */}
      <RootLayoutBoundary>{cache.rsc}</RootLayoutBoundary>
      <AppRouterAnnouncer tree={tree} />
    </RedirectBoundary>
  )

  if (process.env.NODE_ENV !== 'production') {
    // In development, we apply few error boundaries and hot-reloader:
    // - DevRootHTTPAccessFallbackBoundary: avoid using navigation API like notFound() in root layout
    // - HotReloader:
    //  - hot-reload the app when the code changes
    //  - render dev overlay
    //  - catch runtime errors and display global-error when necessary
    if (typeof window !== 'undefined') {
      const { DevRootHTTPAccessFallbackBoundary } =
        require('./dev-root-http-access-fallback-boundary') as typeof import('./dev-root-http-access-fallback-boundary')
      content = (
        <DevRootHTTPAccessFallbackBoundary>
          {content}
        </DevRootHTTPAccessFallbackBoundary>
      )
    }
    const HotReloader: typeof import('../dev/hot-reloader/app/hot-reloader-app').default =
      (
        require('../dev/hot-reloader/app/hot-reloader-app') as typeof import('../dev/hot-reloader/app/hot-reloader-app')
      ).default

    content = (
      <HotReloader
        globalError={globalError}
        webSocket={webSocket}
        staticIndicatorState={staticIndicatorState}
      >
        {content}
      </HotReloader>
    )
  } else {
    content = (
      <RootErrorBoundary
        errorComponent={globalError[0]}
        errorStyles={globalError[1]}
      >
        {content}
      </RootErrorBoundary>
    )
  }

  return (
    <>
      <HistoryUpdater appRouterState={state} />
      <RuntimeStyles />
      <NavigationPromisesContext.Provider
        value={instrumentedNavigationPromises}
      >
        <PathParamsContext.Provider value={pathParams}>
          <PathnameContext.Provider value={pathname}>
            <SearchParamsContext.Provider value={searchParams}>
              <GlobalLayoutRouterContext.Provider
                value={globalLayoutRouterContext}
              >
                {/* TODO: We should be able to remove this context. useRouter
                    should import from app-router-instance instead. It's only
                    necessary because useRouter is shared between Pages and
                    App Router. We should fork that module, then remove this
                    context provider. */}
                <AppRouterContext.Provider value={publicAppRouterInstance}>
                  <LayoutRouterContext.Provider value={layoutRouterContext}>
                    {content}
                  </LayoutRouterContext.Provider>
                </AppRouterContext.Provider>
              </GlobalLayoutRouterContext.Provider>
            </SearchParamsContext.Provider>
          </PathnameContext.Provider>
        </PathParamsContext.Provider>
      </NavigationPromisesContext.Provider>
    </>
  )
}

export default function AppRouter({
  actionQueue,
  globalErrorState,
  webSocket,
  staticIndicatorState,
}: {
  actionQueue: AppRouterActionQueue
  globalErrorState: GlobalErrorState
  webSocket?: WebSocket
  staticIndicatorState?: StaticIndicatorState
}) {
  useNavFailureHandler()

  const router = (
    <Router
      actionQueue={actionQueue}
      globalError={globalErrorState}
      webSocket={webSocket}
      staticIndicatorState={staticIndicatorState}
    />
  )

  // At the very top level, use the default GlobalError component as the final fallback.
  // When the app router itself fails, which means the framework itself fails, we show the default error.
  return (
    <RootErrorBoundary errorComponent={DefaultGlobalError}>
      {router}
    </RootErrorBoundary>
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
