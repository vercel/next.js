import React from 'react'
import type { FlightRouterState, FlightData } from '../../server/app-render'

export type ChildSegmentMap = Map<string, CacheNode>
type ParallelRoutesCacheNodes = Map<string, ChildSegmentMap>

export type CacheNode = {
  data: ReturnType<
    typeof import('../../client/components/app-router.client').fetchServerResponse
  > | null
  subTreeData: null | React.ReactNode
  parallelRoutes: ParallelRoutesCacheNodes
}

export type AppRouterInstance = {
  push(href: string): void
  softPush(href: string): void
  replace(href: string): void
  softReplace(href: string): void
  prefetch(href: string): Promise<void>
}

export const AppRouterContext = React.createContext<AppRouterInstance>(
  null as any
)
export const AppTreeContext = React.createContext<{
  childNodes: CacheNode['parallelRoutes']
  tree: FlightRouterState
  url: string
}>(null as any)
export const FullAppTreeContext = React.createContext<{
  tree: FlightRouterState
  changeByServerResponse: (
    previousTree: FlightRouterState,
    flightData: FlightData
  ) => void
}>(null as any)

if (process.env.NODE_ENV !== 'production') {
  AppRouterContext.displayName = 'AppRouterContext'
  AppTreeContext.displayName = 'AppTreeContext'
  FullAppTreeContext.displayName = 'FullAppTreeContext'
}
