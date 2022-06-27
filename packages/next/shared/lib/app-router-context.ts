import React from 'react'
import type { FlightRouterState, FlightData } from '../../server/app-render'

type ParallelRoutesCacheNodes = {
  [key: string]: Map<string, CacheNode>
}

export type CacheNode = {
  data?: ReturnType<
    typeof import('../../client/components/app-router.client').fetchServerResponse
  > | null
  subTreeData: null | React.ReactNode
  parallelRoutes: ParallelRoutesCacheNodes
  previousParallelRoutes?: ParallelRoutesCacheNodes
}

export type AppRouterInstance = {
  push(href: string): void
  replace(href: string): void
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
