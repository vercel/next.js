import type { FallbackMode } from '../../lib/fallback'

type StaticPrerenderedRoute = {
  pathname: string
  encodedPathname: string
  fallbackRouteParams: undefined
  fallbackMode: FallbackMode | undefined
  fallbackRootParams: undefined
}

type FallbackPrerenderedRoute = {
  pathname: string
  encodedPathname: string
  fallbackRouteParams: readonly string[]
  fallbackMode: FallbackMode | undefined
  fallbackRootParams: readonly string[]
}

export type PrerenderedRoute = StaticPrerenderedRoute | FallbackPrerenderedRoute

export type StaticPathsResult = {
  fallbackMode: FallbackMode
  prerenderedRoutes: PrerenderedRoute[]
}
