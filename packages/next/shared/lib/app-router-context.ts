import React from 'react'
import type { FlightRouterState, FlightData } from '../../server/app-render'

export type CacheNode = {
  data?: { readRoot: () => FlightData } | null
  subTreeData: null | React.ReactNode
  childNodes: Map<string, CacheNode>
}

export const AppRouterContext = React.createContext<any>(null as any)
export const AppTreeContext = React.createContext<{
  childNodes: CacheNode['childNodes']
  tree: FlightRouterState
  url: string
}>(null as any)
export const FullAppTreeContext = React.createContext<any>(null as any)

if (process.env.NODE_ENV !== 'production') {
  AppRouterContext.displayName = 'AppRouterContext'
  AppTreeContext.displayName = 'AppTreeContext'
  FullAppTreeContext.displayName = 'FullAppTreeContext'
}
