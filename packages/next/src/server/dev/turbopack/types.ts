import type { Endpoint, Instrumentation, Middleware } from '../../../build/swc'

export interface GlobalEntrypoints {
  app: Endpoint | undefined
  document: Endpoint | undefined
  error: Endpoint | undefined

  middleware: Middleware | undefined
  instrumentation: Instrumentation | undefined
}

export type PageRoute =
  | {
      type: 'page'
      htmlEndpoint: Endpoint
      dataEndpoint: Endpoint
    }
  | {
      type: 'page-api'
      endpoint: Endpoint
    }

export type AppRoute =
  | {
      type: 'app-page'
      htmlEndpoint: Endpoint
      rscEndpoint: Endpoint
    }
  | {
      type: 'app-route'
      endpoint: Endpoint
    }

// pathname -> route
export type PageEntrypoints = Map<string, PageRoute>

// originalName / page -> route
export type AppEntrypoints = Map<string, AppRoute>

export type Entrypoints = {
  global: GlobalEntrypoints

  page: PageEntrypoints
  app: AppEntrypoints
}
