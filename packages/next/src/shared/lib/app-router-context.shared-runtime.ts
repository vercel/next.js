'use client'

import type {
  FocusAndScrollRef,
  PrefetchKind,
} from '../../client/components/router-reducer/router-reducer-types'
import type { Params } from '../../server/request/params'
import type {
  FlightRouterState,
  FlightSegmentPath,
  CacheNode,
} from './app-router-types'
import React from 'react'

export interface NavigateOptions {
  scroll?: boolean
}

export interface PrefetchOptions {
  kind: PrefetchKind
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
}

export const AppRouterContext = React.createContext<AppRouterInstance | null>(
  null
)
export const LayoutRouterContext = React.createContext<{
  parentTree: FlightRouterState
  parentCacheNode: CacheNode
  parentSegmentPath: FlightSegmentPath | null
  parentParams: Params
  debugNameContext: string | undefined
  url: string
  isActive: boolean
} | null>(null)

export const GlobalLayoutRouterContext = React.createContext<{
  tree: FlightRouterState
  focusAndScrollRef: FocusAndScrollRef
  nextUrl: string | null
  previousNextUrl: string | null
}>(null as any)

export const TemplateContext = React.createContext<React.ReactNode>(null as any)

if (process.env.NODE_ENV !== 'production') {
  AppRouterContext.displayName = 'AppRouterContext'
  LayoutRouterContext.displayName = 'LayoutRouterContext'
  GlobalLayoutRouterContext.displayName = 'GlobalLayoutRouterContext'
  TemplateContext.displayName = 'TemplateContext'
}

export const MissingSlotContext = React.createContext<Set<string>>(new Set())
