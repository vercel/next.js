import React from 'react'

export type CacheNode = {
  subtreeData: null | React.ReactNode
  childNodes: Map<string, CacheNode>
}

export const AppRouterContext = React.createContext<any>(null as any)
export const AppRouterCacheContext = React.createContext<
  CacheNode['childNodes']
>(null as any)
export const AppTreeContext = React.createContext<any>(null as any)
export const AppTreeUpdateContext = React.createContext<any>(null as any)

if (process.env.NODE_ENV !== 'production') {
  AppRouterContext.displayName = 'AppRouterContext'
  AppTreeContext.displayName = 'AppTreeContext'
  AppTreeUpdateContext.displayName = 'AppTreeUpdateContext'
  AppRouterCacheContext.displayName = 'AppRouterCacheContext'
}
