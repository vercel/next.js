'use client'

import type {
  FocusAndScrollRef,
  PrefetchKind,
  RouterChangeByServerResponse,
} from '../../client/components/router-reducer/router-reducer-types'
import type { FetchServerResponseResult } from '../../client/components/router-reducer/fetch-server-response'
import type { FlightRouterState } from '../../server/app-render/types'
import React from 'react'

export type ChildSegmentMap = Map<string, CacheNode>

/**
 * Cache node used in app-router / layout-router.
 */
export type CacheNode = ReadyCacheNode | LazyCacheNode

export type LazyCacheNode = {
  /**
   * Whether the lazy cache node data promise has been resolved.
   * This value is only true after we've called `use` on the promise (and applied the data to the tree).
   */
  lazyDataResolved?: boolean
  /**
   * When rsc is null, this is a lazily-initialized cache node.
   *
   * If the app attempts to render it, it triggers a lazy data fetch,
   * postpones the render, and schedules an update to a new tree.
   *
   * TODO: This mechanism should not be used when PPR is enabled, though it
   * currently is in some cases until we've implemented partial
   * segment fetching.
   */
  rsc: null

  /**
   * A prefetched version of the segment data. See explanation in corresponding
   * field of ReadyCacheNode (below).
   *
   * Since LazyCacheNode mostly only exists in the non-PPR implementation, this
   * will usually be null, but it could have been cloned from a previous
   * CacheNode that was created by the PPR implementation. Eventually we want
   * to migrate everything away from LazyCacheNode entirely.
   */
  prefetchRsc: React.ReactNode

  /**
   * A pending response for the lazy data fetch. If this is not present
   * during render, it is lazily created.
   */
  lazyData: Promise<FetchServerResponseResult> | null

  // TODO: We should make both of these non-optional. Most of the places that
  // clone the Cache Nodes do not preserve this field. In practice this ends up
  // working out because we only clone nodes when we're receiving a new head,
  // anyway. But it's fragile. It also breaks monomorphization.
  prefetchHead?: React.ReactNode
  head?: React.ReactNode
  /**
   * Child parallel routes.
   */
  parallelRoutes: Map<string, ChildSegmentMap>
}

export type ReadyCacheNode = {
  /**
   * Whether the lazy cache node data promise has been resolved.
   * This value is only true after we've called `use` on the promise (and applied the data to the tree).
   */
  lazyDataResolved?: boolean
  /**
   * When rsc is not null, it represents the RSC data for the
   * corresponding segment.
   *
   * `null` is a valid React Node but because segment data is always a
   * <LayoutRouter> component, we can use `null` to represent empty.
   *
   * TODO: For additional type safety, update this type to
   * Exclude<React.ReactNode, null>. Need to update createEmptyCacheNode to
   * accept rsc as an argument, or just inline the callers.
   */
  rsc: React.ReactNode

  /**
   * Represents a static version of the segment that can be shown immediately,
   * and may or may not contain dynamic holes. It's prefetched before a
   * navigation occurs.
   *
   * During rendering, we will choose whether to render `rsc` or `prefetchRsc`
   * with `useDeferredValue`. As with the `rsc` field, a value of `null` means
   * no value was provided. In this case, the LayoutRouter will go straight to
   * rendering the `rsc` value; if that one is also missing, it will suspend and
   * trigger a lazy fetch.
   */
  prefetchRsc: React.ReactNode

  /**
   * There should never be a lazy data request in this case.
   */
  lazyData: null
  prefetchHead?: React.ReactNode
  head?: React.ReactNode
  parallelRoutes: Map<string, ChildSegmentMap>
}

export interface NavigateOptions {
  scroll?: boolean
}

export interface PrefetchOptions {
  kind: PrefetchKind
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
}

export const AppRouterContext = React.createContext<AppRouterInstance | null>(
  null
)
export const LayoutRouterContext = React.createContext<{
  childNodes: CacheNode['parallelRoutes']
  tree: FlightRouterState
  url: string
} | null>(null)

export const GlobalLayoutRouterContext = React.createContext<{
  buildId: string
  tree: FlightRouterState
  changeByServerResponse: RouterChangeByServerResponse
  focusAndScrollRef: FocusAndScrollRef
  nextUrl: string | null
}>(null as any)

export const TemplateContext = React.createContext<React.ReactNode>(null as any)

if (process.env.NODE_ENV !== 'production') {
  AppRouterContext.displayName = 'AppRouterContext'
  LayoutRouterContext.displayName = 'LayoutRouterContext'
  GlobalLayoutRouterContext.displayName = 'GlobalLayoutRouterContext'
  TemplateContext.displayName = 'TemplateContext'
}

export const MissingSlotContext = React.createContext<Set<string>>(new Set())
