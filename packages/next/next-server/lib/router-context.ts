import React from 'react'
import { NextRouter } from './router/router'
console.log(React)
export const RouterContext = React.createContext<NextRouter>(null as any)

if (process.env.NODE_ENV !== 'production') {
  RouterContext.displayName = 'RouterContext'
}
