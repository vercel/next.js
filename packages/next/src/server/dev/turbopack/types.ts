import type {
  Endpoint,
  Instrumentation,
  Middleware,
  Route,
} from '../../../build/swc'

export interface GlobalEntrypoints {
  app: Endpoint | undefined
  document: Endpoint | undefined
  error: Endpoint | undefined

  middleware: Middleware | undefined
  instrumentation: Instrumentation | undefined
}

export type RouteEntrypoints = Map<string, Route>

export type Entrypoints = {
  global: GlobalEntrypoints

  page: RouteEntrypoints
  app: RouteEntrypoints
}
