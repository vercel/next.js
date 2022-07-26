import React from 'react'
import type { FocusRef } from '../../client/components/reducer'
import type { FlightRouterState, FlightData } from '../../server/app-render'

export type ChildSegmentMap = Map<string, CacheNode>

export type CacheNode = {
  data: ReturnType<
    typeof import('../../client/components/app-router.client').fetchServerResponse
  > | null
  subTreeData: null | React.ReactNode
  parallelRoutes: Map<string, ChildSegmentMap>
}

export type AppRouterInstance = {
  /**
   * Reload the current page. Fetches new data from the server.
   */
  reload(): void
  /**
   * Hard navigate to the provided href. Fetches new data from the server.
   * Pushes a new history entry.
   */
  push(href: string): void
  /**
   * Soft navigate to the provided href. Does not fetch data from the server if it was already fetched.
   * Pushes a new history entry.
   */
  softPush(href: string): void
  /**
   * Hard navigate to the provided href. Does not fetch data from the server if it was already fetched.
   * Replaces the current history entry.
   */
  replace(href: string): void
  /**
   * Soft navigate to the provided href. Does not fetch data from the server if it was already fetched.
   * Replaces the current history entry.
   */
  softReplace(href: string): void
  /**
   * Soft prefetch the provided href. Does not fetch data from the server if it was already fetched.
   */
  prefetch(href: string): Promise<void>
}

export const AppRouterContext = React.createContext<AppRouterInstance>(
  null as any
)
export const AppTreeContext = React.createContext<{
  childNodes: CacheNode['parallelRoutes']
  tree: FlightRouterState
  url: string
  stylesheets?: string[]
}>(null as any)
export const GlobalLayoutRouterContext = React.createContext<{
  tree: FlightRouterState
  changeByServerResponse: (
    previousTree: FlightRouterState,
    flightData: FlightData
  ) => void
  focusRef: FocusRef
}>(null as any)

if (process.env.NODE_ENV !== 'production') {
  AppRouterContext.displayName = 'AppRouterContext'
  AppTreeContext.displayName = 'AppTreeContext'
  GlobalLayoutRouterContext.displayName = 'GlobalLayoutRouterContext'
}
