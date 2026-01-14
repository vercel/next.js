import {
  type AppRouterState,
  ACTION_REFRESH,
  ACTION_NAVIGATE,
  ACTION_RESTORE,
  type NavigateAction,
  ACTION_HMR_REFRESH,
  PrefetchKind,
  type AppHistoryState,
} from './router-reducer/router-reducer-types'
import { startTransition } from 'react'
import {
  FetchStrategy,
  type PrefetchTaskFetchStrategy,
} from './segment-cache/types'
import { prefetch as prefetchWithSegmentCache } from './segment-cache/prefetch'
import { addBasePath } from '../add-base-path'
import { isExternalURL } from './app-router-utils'
import type {
  AppRouterInstance,
  NavigateOptions,
  PrefetchOptions,
} from '../../shared/lib/app-router-context.shared-runtime'
import { setLinkForCurrentNavigation, type LinkInstance } from './links'
import type { ClientInstrumentationHooks } from '../app-index'
import type { GlobalErrorComponent } from './builtin/global-error'
import { isJavaScriptURLString } from '../lib/javascript-url'
import {
  dispatchAppRouterAction,
  getCurrentAppRouterState,
  initializeRouterTaskQueue,
} from './router-reducer/reducers/router-task'

let onRouterTransitionStart:
  | ((url: string, type: 'push' | 'replace' | 'traverse') => void)
  | null = null

export type GlobalErrorState = [
  GlobalError: GlobalErrorComponent,
  styles: React.ReactNode,
]

export function initializeAppRouterQueue(
  initialState: AppRouterState,
  instrumentationHooks: ClientInstrumentationHooks | null
): void {
  // The action queue is lazily created on hydration, but after that point
  // it doesn't change. So we can store it in a global rather than pass
  // it around everywhere via props/context.
  if (typeof window !== 'undefined') {
    onRouterTransitionStart =
      instrumentationHooks !== null &&
      typeof instrumentationHooks.onRouterTransitionStart === 'function'
        ? // This profiling hook will be called at the start of every navigation.
          instrumentationHooks.onRouterTransitionStart
        : null
    initializeRouterTaskQueue(initialState)
  }
}

export function dispatchNavigateAction(
  href: string,
  navigateType: NavigateAction['navigateType'],
  shouldScroll: boolean,
  linkInstanceRef: LinkInstance | null
): void {
  // TODO: This stuff could just go into the reducer. Leaving as-is for now
  // since we're about to rewrite all the router reducer stuff anyway.
  const url = new URL(addBasePath(href), location.href)
  if (process.env.__NEXT_APP_NAV_FAIL_HANDLING) {
    window.next.__pendingUrl = url
  }

  setLinkForCurrentNavigation(linkInstanceRef)

  if (onRouterTransitionStart !== null) {
    onRouterTransitionStart(href, navigateType)
  }

  dispatchAppRouterAction({
    type: ACTION_NAVIGATE,
    url,
    isExternalUrl: isExternalURL(url),
    locationSearch: location.search,
    shouldScroll,
    navigateType,
  })
}

export function dispatchTraverseAction(
  href: string,
  historyState: AppHistoryState | undefined
) {
  if (onRouterTransitionStart !== null) {
    onRouterTransitionStart(href, 'traverse')
  }
  dispatchAppRouterAction({
    type: ACTION_RESTORE,
    url: new URL(href),
    historyState,
  })
}

/**
 * The app router that is exposed through `useRouter`. These are public API
 * methods. Internal Next.js code should call the lower level methods directly
 * (although there's lots of existing code that doesn't do that).
 */
export const publicAppRouterInstance: AppRouterInstance = {
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  prefetch:
    // Unlike the old implementation, the Segment Cache doesn't store its
    // data in the router reducer state; it writes into a global mutable
    // cache. So we don't need to dispatch an action.
    (href: string, options?: PrefetchOptions) => {
      if (isJavaScriptURLString(href)) {
        throw new Error(
          'Next.js has blocked a javascript: URL as a security precaution.'
        )
      }
      const currentState = getCurrentAppRouterState()
      if (currentState === null) {
        return null
      }

      const prefetchKind = options?.kind ?? PrefetchKind.AUTO

      // We don't currently offer a way to issue a runtime prefetch via `router.prefetch()`.
      // This will be possible when we update its API to not take a PrefetchKind.
      let fetchStrategy: PrefetchTaskFetchStrategy
      switch (prefetchKind) {
        case PrefetchKind.AUTO: {
          // We default to PPR. We'll discover whether or not the route supports it with the initial prefetch.
          fetchStrategy = FetchStrategy.PPR
          break
        }
        case PrefetchKind.FULL: {
          fetchStrategy = FetchStrategy.Full
          break
        }
        default: {
          prefetchKind satisfies never
          // Despite typescript thinking that this can't happen,
          // we might get an unexpected value from user code.
          // We don't know what they want, but we know they want a prefetch,
          // so use the default.
          fetchStrategy = FetchStrategy.PPR
        }
      }

      prefetchWithSegmentCache(
        href,
        currentState.nextUrl,
        currentState.tree,
        fetchStrategy,
        options?.onInvalidate ?? null
      )
    },
  replace: (href: string, options?: NavigateOptions) => {
    if (isJavaScriptURLString(href)) {
      throw new Error(
        'Next.js has blocked a javascript: URL as a security precaution.'
      )
    }
    startTransition(() => {
      dispatchNavigateAction(href, 'replace', options?.scroll ?? true, null)
    })
  },
  push: (href: string, options?: NavigateOptions) => {
    if (isJavaScriptURLString(href)) {
      throw new Error(
        'Next.js has blocked a javascript: URL as a security precaution.'
      )
    }
    startTransition(() => {
      dispatchNavigateAction(href, 'push', options?.scroll ?? true, null)
    })
  },
  refresh: () => {
    startTransition(() => {
      dispatchAppRouterAction({
        type: ACTION_REFRESH,
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
        dispatchAppRouterAction({
          type: ACTION_HMR_REFRESH,
        })
      })
    }
  },
}

// Exists for debugging purposes. Don't use in application code.
if (typeof window !== 'undefined' && window.next) {
  window.next.router = publicAppRouterInstance
}
