import React from 'react'

export const AppRouterContext = React.createContext<any>(null as any)

if (process.env.NODE_ENV !== 'production') {
  AppRouterContext.displayName = 'AppRouterContext'
}
