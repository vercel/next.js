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
  remainingPrerenderableParams?: undefined

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
}

type FallbackPrerenderedRoute = {
  readonly params: Params
  readonly pathname: string
  readonly encodedPathname: string

  /**
   * The fallback route params for the route. This includes all route parameters
   * that are unknown at build time, from both the main children route and any
   * parallel routes.
   */
  readonly fallbackRouteParams: readonly FallbackRouteParam[]
  readonly fallbackMode: FallbackMode | undefined
  readonly fallbackRootParams: readonly string[]
  remainingPrerenderableParams?: readonly FallbackRouteParam[]

  /**
   * When enabled, the route will be rendered with diagnostics enabled which
   * will error the build if the route that is generated is empty.
   */
  throwOnEmptyStaticShell: boolean
}

/**
 * A route the build plans to prerender. Rendering decides whether the result
 * becomes a published output: for example, an allowed empty fallback shell is
 * discarded and its matcher becomes blocking instead.
 *
 * The historical name is retained because this type is used throughout static
 * path generation, but values of this type are prerender candidates rather
 * than guaranteed outputs.
 */
export type PrerenderedRoute = StaticPrerenderedRoute | FallbackPrerenderedRoute

/**
 * Describes how a dynamic pathname is matched when no concrete build-time
 * output matches it. It describes the logical route independently of any
 * artifacts produced for it, and is not itself something to render.
 *
 * Zero or more prerender candidates may share this pathname. In particular,
 * variants can produce several artifacts for one logical matcher, so consumers
 * must not assume pathname identifies a single candidate or render result.
 */
export type PrerenderRouteMatcher = {
  readonly pathname: string
  readonly fallbackRouteParams: readonly FallbackRouteParam[]
  readonly fallbackMode: FallbackMode | undefined
  readonly fallbackRootParams: readonly string[]
  readonly remainingPrerenderableParams?: readonly FallbackRouteParam[]
}

export type StaticPathsResult = {
  fallbackMode: FallbackMode | undefined

  /** Planned renders, some of which may be discarded after rendering. */
  prerenderedRoutes: PrerenderedRoute[] | undefined

  /** Logical request matchers, independent of the artifacts rendered for them. */
  prerenderRouteMatchers?: PrerenderRouteMatcher[]
}
