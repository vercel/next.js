import type { ProxyMatcher } from '../../build/analysis/get-page-static-info'

export type DevServerState = {
  actualMiddlewareFile?: string
  actualInstrumentationHookFile?: string
  appPathRoutes?: Record<string, string[]>
  middleware?: {
    page: string
    matchers?: ProxyMatcher[]
  }
}

export type DevServerStateUpdate = Partial<DevServerState>
