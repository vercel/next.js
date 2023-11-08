import React from 'react'
import type { NextRouter } from './router/router'

export const RouterContext = React.createContext<NextRouter | null>(null)

if (process.env.NODE_ENV !== 'production') {
  RouterContext.displayName = 'RouterContext'
}
