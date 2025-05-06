'use client'

import React, {
  use,
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
import type { CacheNode } from '../../shared/lib/app-router-context.shared-runtime'
import { ACTION_RESTORE } from './router-reducer/router-reducer-types'
import type { AppRouterState } from './router-reducer/router-reducer-types'
import { createHrefFromUrl } from './router-reducer/create-href-from-url'
import {
  SearchParamsContext,
  PathnameContext,
  PathParamsContext,
} from '../../shared/lib/hooks-client-context.shared-runtime'
import { dispatchAppRouterAction, useActionQueue } from './use-action-queue'
import { ErrorBoundary } from './error-boundary'
import DefaultGlobalError, {
  type GlobalErrorComponent,
} from '../../client/components/global-error'
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
import {
  dispatchTraverseAction,
  publicAppRouterInstance,
  type AppRouterActionQueue,
} from './app-router-instance'
import { getRedirectTypeFromError, getURLFromRedirectError } from './redirect'
import { isRedirectError, RedirectType } from './redirect-error'
import { pingVisibleLinks } from './links'
import GracefulDegradeBoundary from './errors/graceful-degrade-boundary'

const globalMutable: {
  pendingMpaPath?: string
} = {}

export function isExternalURL(url: URL) {
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
  assetPrefix,
  globalError,
  gracefullyDegrade,
}: {
  actionQueue: AppRouterActionQueue
  assetPrefix: string
  globalError: [GlobalErrorComponent, React.ReactNode]
  gracefullyDegrade: boolean
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
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { cache, prefetchCache, tree } = state

    // This hook is in a conditional but that is ok because `process.env.NODE_ENV` never changes
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      // Add `window.nd` for debugging purposes.
      // This is not meant for use in applications as concurrent rendering will affect the cache/tree/router.
      // @ts-ignore this is for debugging
      window.nd = {
        router: publicAppRouterInstance,
        cache,
        prefetchCache,
        tree,
      }
    }, [cache, prefetchCache, tree])
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
        tree: window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE,
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
        dispatchAppRouterAction({
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

  const { cache, tree, nextUrl, focusAndScrollRef } = state

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
      tree,
      focusAndScrollRef,
      nextUrl,
    }
  }, [tree, focusAndScrollRef, nextUrl])

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
    const HotReloader: typeof import('./react-dev-overlay/app/hot-reloader-client').default =
      require('./react-dev-overlay/app/hot-reloader-client').default

    content = (
      <HotReloader assetPrefix={assetPrefix} globalError={globalError}>
        {content}
      </HotReloader>
    )
  } else {
    // If gracefully degrading is applied in production,
    // leave the app as it is rather than caught by GlobalError boundary.
    if (gracefullyDegrade) {
      content = <GracefulDegradeBoundary>{content}</GracefulDegradeBoundary>
    } else {
      content = (
        <ErrorBoundary
          errorComponent={globalError[0]}
          errorStyles={globalError[1]}
        >
          {content}
        </ErrorBoundary>
      )
    }
  }

  return (
    <>
      <HistoryUpdater appRouterState={state} />
      <RuntimeStyles />
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
    </>
  )
}

export default function AppRouter({
  actionQueue,
  globalErrorComponentAndStyles: [globalErrorComponent, globalErrorStyles],
  assetPrefix,
  gracefullyDegrade,
}: {
  actionQueue: AppRouterActionQueue
  globalErrorComponentAndStyles: [GlobalErrorComponent, React.ReactNode]
  assetPrefix: string
  gracefullyDegrade: boolean
}) {
  useNavFailureHandler()

  const router = (
    <Router
      actionQueue={actionQueue}
      assetPrefix={assetPrefix}
      globalError={[globalErrorComponent, globalErrorStyles]}
      gracefullyDegrade={gracefullyDegrade}
    />
  )

  if (gracefullyDegrade) {
    return router
  } else {
    return (
      <ErrorBoundary
        // At the very top level, use the default GlobalError component as the final fallback.
        // When the app router itself fails, which means the framework itself fails, we show the default error.
        errorComponent={DefaultGlobalError}
      >
        {router}
      </ErrorBoundary>
    )
  }
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
