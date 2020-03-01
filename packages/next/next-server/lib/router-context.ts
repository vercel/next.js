import * as React from 'react'
import { NextRouter } from './router/router'

export const RouterContext = React.createContext<NextRouter>(null as any)
