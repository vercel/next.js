import React from 'react'

export const AppRouterContext = React.createContext<any>(null as any)
export const AppTreeContext = React.createContext<any>(null as any)
export const AppTreeUpdateContext = React.createContext<any>(null as any)

if (process.env.NODE_ENV !== 'production') {
  AppRouterContext.displayName = 'AppRouterContext'
  AppTreeContext.displayName = 'AppTreeContext'
  AppTreeUpdateContext.displayName = 'AppTreeUpdateContext'
}
