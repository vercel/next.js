import type { FallbackMode } from '../../lib/fallback'
import type { Params } from '../../server/request/params'
import type { DynamicParamTypes } from '../../shared/lib/app-router-types'

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

export type FallbackRouteParam = {
  /**
   * The name of the param.
   */
  readonly paramName: string

  /**
   * The type of the param.
   */
  readonly paramType: DynamicParamTypes

  /**
   * Whether this is a parallel route param or descends from a parallel route
   * param.
   */
  readonly isParallelRouteParam: boolean
}

type FallbackPrerenderedRoute = {
  readonly params: Params
  readonly pathname: string
  readonly encodedPathname: string

  /**
   * The fallback route params for the route. This includes both the parallel
   * route params and the non-parallel route params.
   */
  readonly fallbackRouteParams: readonly FallbackRouteParam[]
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
  fallbackMode: FallbackMode | undefined
  prerenderedRoutes: PrerenderedRoute[] | undefined
}
