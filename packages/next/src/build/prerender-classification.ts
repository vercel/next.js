import type {
  DynamicPrerenderManifestRoute,
  PrerenderManifest,
  PrerenderManifestRoute,
  RoutesManifest,
} from '.'
import { NEXT_QUERY_PARAM_PREFIX } from '../lib/constants'
import { getRscPrerenderCompleteness } from '../server/lib/prerender-rsc-completeness'
import { InvariantError } from '../shared/lib/invariant-error'
import { getNamedRouteRegex } from '../shared/lib/router/utils/route-regex'

/**
 * Classification metadata for a prerendered response. App Router HTML and
 * full-route RSC outputs have independent classifications. Pages Router data
 * and static segment-prefetch outputs omit these fields.
 */
export type PrerenderClassification =
  | {
      /**
       * Which kind of canonical response this output represents.
       *
       * - `route`: a non-UI route, such as a Route Handler.
       * - `page`: a page whose URL has no missing prerenderable params.
       * - `shell`: the most specific reusable page shell for its URL class.
       * - `fallback`: a reusable page response that can be specialized by
       * filling more prerenderable params.
       */
      routeType: 'route' | 'fallback' | 'shell' | 'page'

      /**
       * How complete the response is before any request-time work.
       *
       * - `empty`: no initial page response can be served.
       * - `initial`: an initial response can be served, but it is not the
       * completed page UI.
       * - `complete`: the response is complete. This can still describe a
       * zero-byte response body, such as a 204 Route Handler response.
       */
      response: 'empty' | 'initial' | 'complete'

      /**
       * The request-time compute mode for serving this output.
       *
       * - `blocking`: wait for a usable prerender before serving the response.
       * - `dynamic`: request-time rendering produces the first response bytes.
       * - `resuming`: initial content is served while postponed work resumes.
       * - `static`: generated output needs no per-request server rendering.
       *
       * A blocking output requires generation or revalidation when no usable
       * cached prerender exists. The result can still be partial. A dynamic
       * render can reuse cached postponed state and stream without waiting for
       * a separate prerender first.
       *
       * Next.js uses build-time prerender results to infer whether an empty
       * parameter matcher must wait for a prerender.
       */
      compute: 'blocking' | 'dynamic' | 'resuming' | 'static'

      /**
       * The byte size of the prerendered HTML shell. Only the HTML output
       * exposes this; sibling RSC/data/segment outputs omit it.
       */
      htmlSize?: number
    }
  | {
      routeType?: never
      response?: never
      compute?: never
      htmlSize?: never
    }

export function getPrerenderClassification(
  route: string,
  routeType: PrerenderManifestRoute['routeType'],
  response: PrerenderManifestRoute['response'],
  compute: PrerenderManifestRoute['compute'],
  htmlSize: PrerenderManifestRoute['htmlSize']
): PrerenderClassification {
  if (
    routeType === undefined &&
    response === undefined &&
    compute === undefined &&
    htmlSize === undefined
  ) {
    return {}
  }

  if (
    routeType === undefined ||
    response === undefined ||
    compute === undefined
  ) {
    throw new InvariantError(
      `Expected complete prerender classification for route "${route}"`
    )
  }

  return {
    routeType,
    response,
    compute,
    ...(typeof htmlSize === 'number' && { htmlSize }),
  }
}

export function getRscPrerenderClassification(
  route: PrerenderManifestRoute | DynamicPrerenderManifestRoute | undefined
): PrerenderClassification {
  if (
    route === undefined ||
    route.routeType === undefined ||
    route.routeType === 'route' ||
    route.compute === undefined
  ) {
    return {}
  }

  const response = getRscPrerenderCompleteness(route)
  if (response === undefined) {
    return {}
  }

  const compute =
    response === 'complete' || route._isEnsureStaticPage
      ? 'static'
      : route.compute === 'blocking'
        ? 'blocking'
        : 'dynamic'

  return {
    routeType: route.routeType,
    response,
    compute,
  }
}

function hasRemainingPrerenderableParams(
  route: DynamicPrerenderManifestRoute
): boolean {
  return (
    (route.remainingPrerenderableParams?.length ?? 0) > 0 ||
    (route.fallbackRootParams?.length ?? 0) > 0
  )
}

export function createDynamicPrerenderClassifier(
  prerenderManifest: PrerenderManifest,
  routesManifest: RoutesManifest
) {
  const queryKeysByPathname = new Map<string, readonly string[]>(
    routesManifest.dynamicRoutes.map((route) => [
      route.page,
      Object.values(
        route.routeKeys ??
          getNamedRouteRegex(route.page, { prefixRouteKeys: true }).routeKeys
      ),
    ])
  )
  const continuationBySource = new Map<
    string,
    Map<string, { html: boolean; rsc: boolean }>
  >()

  const getUnresolvedParamsKey = (queryKeys: readonly string[]) =>
    JSON.stringify([...new Set(queryKeys)].sort())

  function getPathnameQueryKeys(pathname: string): readonly string[] {
    let keys = queryKeysByPathname.get(pathname)
    if (keys === undefined) {
      keys = Object.values(
        getNamedRouteRegex(pathname, { prefixRouteKeys: true }).routeKeys
      )
      queryKeysByPathname.set(pathname, keys)
    }
    return keys
  }

  function recordPrerenderResult(
    source: string,
    route: PrerenderManifestRoute | DynamicPrerenderManifestRoute,
    unresolvedQueryKeys: readonly string[]
  ) {
    const html = route.compute === 'dynamic' || route.compute === 'resuming'
    const rsc = getRscPrerenderClassification(route).compute === 'dynamic'
    let continuationByParams = continuationBySource.get(source)
    if (continuationByParams === undefined) {
      continuationByParams = new Map()
      continuationBySource.set(source, continuationByParams)
    }
    const key = getUnresolvedParamsKey(unresolvedQueryKeys)
    const previous = continuationByParams.get(key)
    continuationByParams.set(key, {
      html: html && (previous?.html ?? true),
      rsc: rsc && (previous?.rsc ?? true),
    })
  }

  for (const [pathname, route] of Object.entries(prerenderManifest.routes)) {
    recordPrerenderResult(route.srcRoute ?? pathname, route, [])
  }

  for (const [pathname, route] of Object.entries(
    prerenderManifest.dynamicRoutes
  )) {
    // Terminal shells have resolved all params that generateStaticParams can
    // supply. Intermediate results do not describe the completed prerender.
    if (
      typeof route.fallback === 'string' &&
      !hasRemainingPrerenderableParams(route)
    ) {
      recordPrerenderResult(
        route.fallbackSourceRoute ?? pathname,
        route,
        getPathnameQueryKeys(pathname)
      )
    }
  }

  return function classifyDynamicPrerender(
    pathname: string,
    route: DynamicPrerenderManifestRoute,
    classification: PrerenderClassification,
    kind: 'html' | 'rsc',
    allowQuery: readonly string[]
  ): PrerenderClassification {
    if (
      classification.response !== 'empty' ||
      classification.compute !== 'dynamic'
    ) {
      return classification
    }

    const remainingParamNames = [
      ...(route.fallbackRootParams ?? []),
      ...(route.remainingPrerenderableParams ?? []).map(
        (param) => param.paramName
      ),
    ]
    // A key that omits these params regenerates a shared shell that keeps them
    // unresolved. Results with completed params do not describe that shell.
    if (
      !remainingParamNames.every((paramName) =>
        allowQuery.includes(`${NEXT_QUERY_PARAM_PREFIX}${paramName}`)
      )
    ) {
      return classification
    }

    // Parallel-slot params are derived from the matched URL. Only URL path
    // params identify which build-time results describe this cache entry.
    const pathnameQueryKeys = getPathnameQueryKeys(pathname)
    const unresolvedQueryKeys = pathnameQueryKeys.filter(
      (key) => !allowQuery.includes(key)
    )
    // A shared entry that resolves no additional URL param keeps its mode.
    if (unresolvedQueryKeys.length === pathnameQueryKeys.length) {
      return classification
    }

    // Build-time results must leave the same params unresolved as regeneration
    // for this cache key. A key can resolve params outside
    // generateStaticParams.
    const continuation = continuationBySource
      .get(route.fallbackSourceRoute || pathname)
      ?.get(getUnresolvedParamsKey(unresolvedQueryKeys))
    if (continuation?.[kind] !== true) {
      return { ...classification, compute: 'blocking' }
    }

    return classification
  }
}
