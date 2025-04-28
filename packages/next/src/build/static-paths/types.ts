import type { FallbackMode } from '../../lib/fallback'
import type { Params } from '../../server/request/params'

type StaticPrerenderedRoute = {
  readonly params: Params
  readonly pathname: string
  readonly encodedPathname: string
  readonly fallbackRouteParams: undefined
  readonly fallbackMode: FallbackMode | undefined
  readonly fallbackRootParams: undefined

  /**
   * When enabled, the route will be rendered with diagnostics enabled which
   * will error the build if the route that is generated is empty.
   */
  throwOnEmptyStaticShell: undefined
}

type FallbackPrerenderedRoute = {
  readonly params: Params
  readonly pathname: string
  readonly encodedPathname: string
  readonly fallbackRouteParams: readonly string[]
  readonly fallbackMode: FallbackMode | undefined
  readonly fallbackRootParams: readonly string[]

  /**
   * When enabled, the route will be rendered with diagnostics enabled which
   * will error the build if the route that is generated is empty.
   */
  throwOnEmptyStaticShell: boolean
}

export type PrerenderedRoute = StaticPrerenderedRoute | FallbackPrerenderedRoute

export type StaticPathsResult = {
  fallbackMode: FallbackMode
  prerenderedRoutes: PrerenderedRoute[]
}
