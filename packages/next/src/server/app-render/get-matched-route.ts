import type { FlightRouterState } from '../../shared/lib/app-router-types'
import type { OpaqueFallbackRouteParams } from '../request/fallback-params'
import type { BaseUrlPart } from '../../shared/lib/relative-href'
import {
  isGroupSegment,
  isFrameworkInternalRouteSegment,
  DEFAULT_SEGMENT_KEY,
  PAGE_SEGMENT_KEY,
} from '../../shared/lib/segment'
import { getPrerenderFallbackParams } from './dynamic-rendering'

/**
 * Reads the current page's URL path from a server-rendered router tree, one
 * part per entry. Whether a part came from a static segment or a dynamic
 * param is deliberately not distinguished — a known URL part affects
 * relative path resolution identically either way.
 *
 * A "statically resolvable" path is one reaching a page through only
 * static, route-group, and plain dynamic ([param]) segments. Every segment
 * on such a path matches exactly one URL part (or none, for route groups),
 * so any resolvable path spells out the full URL; when several parallel
 * routes qualify, the choice is arbitrary.
 *
 * The result is shipped to the client on the initial RSC payload (see
 * `InitialRSCPayload.u`) and consumed by `unstable_useRelativeHref` during
 * SSR and hydration. It's only ever computed here, on the tree the server
 * just built — after hydration the client resolves against the actual URL
 * pathname instead, which always yields the same parts this walk would
 * have.
 *
 * A part is null when its value is not known: the param is a fallback param
 * of the current prerender (read off the work unit store, like other
 * navigation hooks do). Null parts are filled in from the actual URL before
 * hydration (see `createInitialRSCPayloadFromFallbackPrerender`), so they
 * never reach the browser. Consumers rendering with a null part must deopt
 * to dynamic rendering if it ends up affecting their output.
 *
 * Returns null when the route has no statically resolvable path — every
 * path to a page goes through a catch-all — in which case relative hrefs
 * resolve against the actual URL (see `computeRelativeHref`).
 *
 * Route groups, the page segment, and the empty root segment contribute no
 * URL parts and are skipped. Dynamic segments carry their matched URL part,
 * already URL-encoded (see `getDynamicParam`), so it can be emitted into an
 * href as-is.
 */
export function getMatchedRoute(tree: FlightRouterState): BaseUrlPart[] | null {
  // The fallback route params of the current prerender, if any. Their
  // values are placeholders, not real URL parts, so segments matching them
  // become null parts.
  const fallbackParams = getPrerenderFallbackParams()
  return getMatchedRouteImpl(tree, fallbackParams)
}

function getMatchedRouteImpl(
  node: FlightRouterState,
  fallbackParams: OpaqueFallbackRouteParams | null
): BaseUrlPart[] | null {
  const segment = node[0]
  // The URL part this segment contributes, or undefined for segments that
  // don't appear in URL space (route groups, the empty root segment).
  let part: BaseUrlPart | undefined
  if (Array.isArray(segment)) {
    // A dynamic segment tuple: [paramName, paramCacheKey, type, ...].
    //
    // TODO: Interception routes ('di(..)', etc.) can display a URL whose
    // shape differs from the rendered route tree, so relative hrefs may
    // not resolve where the tree suggests (see the interception-routes
    // caveat in the useRelativeHref RFC). For now they're treated like
    // their non-intercepted counterparts.
    const dynamicParamType = segment[2]
    if (dynamicParamType === 'oc' || dynamicParamType[0] === 'c') {
      // An (optional) catch-all spans an unknown number of URL parts.
      return null
    }
    part =
      fallbackParams !== null && fallbackParams.has(segment[0])
        ? null
        : segment[1]
  } else if (
    segment === DEFAULT_SEGMENT_KEY ||
    isFrameworkInternalRouteSegment(segment)
  ) {
    // A default slot renders content that doesn't describe the current URL.
    // The built-in 404/error routes render at arbitrary URLs, so their
    // pseudo-segments never appear in URL space.
    return null
  } else if (segment.startsWith(PAGE_SEGMENT_KEY)) {
    // Reached a page (possibly with a query suffix). The path is complete.
    return []
  } else if (segment !== '' && !isGroupSegment(segment)) {
    // A static segment: one URL part.
    part = segment
  }

  // Descend into the children; the first resolvable path wins (see above —
  // the choice is arbitrary).
  const parallelRoutes = node[1]
  for (const key in parallelRoutes) {
    const childPath = getMatchedRouteImpl(parallelRoutes[key], fallbackParams)
    if (childPath !== null) {
      if (part !== undefined) {
        childPath.unshift(part)
      }
      return childPath
    }
  }
  return null
}
