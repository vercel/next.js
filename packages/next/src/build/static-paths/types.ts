import type { FallbackMode } from '../../lib/fallback'

type StaticPrerenderedRoute = {
  path: string
  encoded: string
  fallbackRouteParams: undefined
}

type FallbackPrerenderedRoute = {
  path: string
  encoded: string
  fallbackRouteParams: readonly string[]
}

export type PrerenderedRoute = StaticPrerenderedRoute | FallbackPrerenderedRoute

export type StaticPathsResult = {
  fallbackMode: FallbackMode
  prerenderedRoutes: PrerenderedRoute[]
}
