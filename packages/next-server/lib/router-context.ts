import * as React from 'react'
import Router from './router/router'

export const RouterContext: React.Context<Router> = React.createContext(
  null as any
)
