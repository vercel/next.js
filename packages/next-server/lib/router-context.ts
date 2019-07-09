import * as React from 'react'
import { PublicRouterInstance } from './router/router'

export const RouterContext = React.createContext<PublicRouterInstance>(
  null as any
)
