'use client'

import type { RouteTree } from '../../client/components/segment-cache/cache'

import type { ScrollHandlerRef } from '../../client/components/router-reducer/router-reducer-types'
import type { Params } from '../../server/request/params'
import type {
  FlightRouterState,
  FlightSegmentPath,
  CacheNode,
  LoadingModuleData,
} from './app-router-types'
import React from 'react'

export interface NavigateOptions {
  scroll?: boolean
  /**
   * Transition types to apply when navigating. These types are passed to
   * [`React.addTransitionType`](https://react.dev/reference/react/addTransitionType)
   * inside the navigation transition, enabling
   * [`<ViewTransition>`](https://react.dev/reference/react/ViewTransition) components
   * to apply different animations based on the type of navigation.
   */
  transitionTypes?: string[]
}

/**
 * A navigation started by `router.experimental_prepare()`. Call `push` or
 * `replace` to commit it. A prepared navigation can only be committed once;
 * later calls have no effect.
 * @experimental
 */
export interface PreparedNavigation {
  /**
   * Commit the navigation, pushing a new history entry.
   */
  push(options?: NavigateOptions): void
  /**
   * Commit the navigation, replacing the current history entry.
   */
  replace(options?: NavigateOptions): void
}

export interface PrefetchOptions {
  kind?: 'auto' | 'full' | 'shell' | 'prefetch' | 'navigation'
  onInvalidate?: () => void
}

export interface AppRouterInstance {
  /**
   * Navigate to the previous history entry.
   */
  back(): void
  /**
   * Navigate to the next history entry.
   */
  forward(): void
  /**
   * Refresh the current page.
   */
  refresh(): void
  /**
   * Refresh the current page. Use in development only.
   * @internal
   */
  hmrRefresh(): void
  /**
   * Navigate to the provided href.
   * Pushes a new history entry.
   */
  push(href: string, options?: NavigateOptions): void
  /**
   * Navigate to the provided href.
   * Replaces the current history entry.
   */
  replace(href: string, options?: NavigateOptions): void
  /**
   * Prefetch the provided href.
   */
  prefetch(href: string, options?: PrefetchOptions): void
  /**
   * Perform a gesture navigation using prefetched data.
   * Only available when experimental.gestureTransition is enabled.
   * @experimental
   */
  experimental_gesturePush?(href: string, options?: NavigateOptions): void
  /**
   * Start a navigation without committing it. The navigation's data is
   * requested immediately; calling `push` or `replace` on the result commits
   * the navigation, reusing that data. For example, prepare on `pointerdown`
   * and commit on `click`.
   *
   * Unlike `prefetch`, this issues the full dynamic request for the route, the
   * same as a regular navigation.
   *
   * If the navigation is never committed, its data remains in the router's
   * back/forward cache, where a back/forward navigation to an overlapping
   * route may display it.
   *
   * Only available when experimental.prepareNavigation is enabled.
   * @experimental
   */
  experimental_prepare?(href: string): PreparedNavigation
  /**
   * An opaque string identifier scoped to the current route segment.
   *
   * Changes when the surrounding segment is freshly created by a push or
   * replace navigation. Stays the same for back/forward navigations,
   * `router.refresh()`, and search-param/hash-only changes.
   *
   * Intended to be passed to a React `key` to opt out of state preservation
   * on fresh navigations:
   *
   * ```tsx
   * <form key={useRouter().bfcacheId}>
   * ```
   *
   * In most cases, prefer resetting state explicitly in an event handler, or
   * deriving a key from your data (e.g. a draft id from the server). Use
   * `bfcacheId` only when those patterns aren't a fit.
   */
  bfcacheId: string
}

export const AppRouterContext = React.createContext<AppRouterInstance | null>(
  null
)
export const LayoutRouterContext = React.createContext<{
  parentTree: FlightRouterState
  parentRenderTree: RouteTree<CacheNode>
  parentSegmentPath: FlightSegmentPath | null
  parentParams: Params
  parentLoadingData: LoadingModuleData | null
  debugNameContext: string
  url: string
  isActive: boolean
} | null>(null)

export const GlobalLayoutRouterContext = React.createContext<{
  tree: FlightRouterState
  scrollRef: ScrollHandlerRef
  nextUrl: string | null
  previousNextUrl: string | null
}>(null as any)

export const TemplateContext = React.createContext<React.ReactNode>(null)

if (process.env.NODE_ENV !== 'production') {
  AppRouterContext.displayName = 'AppRouterContext'
  LayoutRouterContext.displayName = 'LayoutRouterContext'
  GlobalLayoutRouterContext.displayName = 'GlobalLayoutRouterContext'
  TemplateContext.displayName = 'TemplateContext'
}

export const MissingSlotContext = React.createContext<Set<string>>(new Set())
