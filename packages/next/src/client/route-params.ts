import type { DynamicParamTypesShort } from '../server/app-render/types'
import { PAGE_SEGMENT_KEY } from '../shared/lib/segment'
import { ROOT_SEGMENT_REQUEST_KEY } from '../shared/lib/segment-cache/segment-value-encoding'
import {
  NEXT_REWRITTEN_PATH_HEADER,
  NEXT_REWRITTEN_QUERY_HEADER,
} from './components/app-router-headers'
import type { RSCResponse } from './components/router-reducer/fetch-server-response'
import type { NormalizedSearch } from './components/segment-cache'

type RouteParamValue = string | Array<string> | null

export type RouteParam = {
  name: string
  value: RouteParamValue
  type: DynamicParamTypesShort
}

export function getRenderedSearch(response: RSCResponse): NormalizedSearch {
  // If the server performed a rewrite, the search params used to render the
  // page will be different from the params in the request URL. In this case,
  // the response will include a header that gives the rewritten search query.
  const rewrittenQuery = response.headers.get(NEXT_REWRITTEN_QUERY_HEADER)
  if (rewrittenQuery !== null) {
    return (
      rewrittenQuery === '' ? '' : '?' + rewrittenQuery
    ) as NormalizedSearch
  }
  // If the header is not present, there was no rewrite, so we use the search
  // query of the response URL.
  return new URL(response.url).search as NormalizedSearch
}

export function getRenderedPathname(response: RSCResponse): string {
  // If the server performed a rewrite, the pathname used to render the
  // page will be different from the pathname in the request URL. In this case,
  // the response will include a header that gives the rewritten pathname.
  const rewrittenPath = response.headers.get(NEXT_REWRITTEN_PATH_HEADER)
  return rewrittenPath ?? new URL(response.url).pathname
}

export function parseDynamicParamFromURLPart(
  paramType: DynamicParamTypesShort,
  pathnameParts: Array<string>,
  partIndex: number
): RouteParamValue {
  // This needs to match the behavior in get-dynamic-param.ts.
  switch (paramType) {
    // Catchalls
    case 'c':
    case 'ci': {
      // Catchalls receive all the remaining URL parts. If there are no
      // remaining pathname parts, return an empty array.
      return partIndex < pathnameParts.length
        ? pathnameParts.slice(partIndex).map((s) => encodeURIComponent(s))
        : []
    }
    // Optional catchalls
    case 'oc': {
      // Optional catchalls receive all the remaining URL parts, unless this is
      // the end of the pathname, in which case they return null.
      return partIndex < pathnameParts.length
        ? pathnameParts.slice(partIndex).map((s) => encodeURIComponent(s))
        : null
    }
    // Dynamic
    case 'd':
    case 'di': {
      if (partIndex >= pathnameParts.length) {
        // The route tree expected there to be more parts in the URL than there
        // actually are. This could happen if the x-nextjs-rewritten-path header
        // is incorrectly set, or potentially due to bug in Next.js. TODO:
        // Should this be a hard error? During a prefetch, we can just abort.
        // During a client navigation, we could trigger a hard refresh. But if
        // it happens during initial render, we don't really have any
        // recovery options.
        return ''
      }
      return encodeURIComponent(pathnameParts[partIndex])
    }
    default:
      paramType satisfies never
      return ''
  }
}

export function doesStaticSegmentAppearInURL(segment: string): boolean {
  // This is not a parameterized segment; however, we need to determine
  // whether or not this segment appears in the URL. For example, this route
  // groups do not appear in the URL, so they should be skipped. Any other
  // special cases must be handled here.
  // TODO: Consider encoding this directly into the router tree instead of
  // inferring it on the client based on the segment type. Something like
  // a `doesAppearInURL` flag in FlightRouterState.
  if (
    segment === ROOT_SEGMENT_REQUEST_KEY ||
    // For some reason, the loader tree sometimes includes extra __PAGE__
    // "layouts" when part of a parallel route. But it's not a leaf node.
    // Otherwise, we wouldn't need this special case because pages are
    // always leaf nodes.
    // TODO: Investigate why the loader produces these fake page segments.
    segment.startsWith(PAGE_SEGMENT_KEY) ||
    // Route groups.
    (segment[0] === '(' && segment.endsWith(')'))
  ) {
    return false
  } else {
    // All other segment types appear in the URL
    return true
  }
}

export function getCacheKeyForDynamicParam(
  paramValue: RouteParamValue
): string {
  // This needs to match the logic in get-dynamic-param.ts, until we're able to
  // unify the various implementations so that these are always computed on
  // the client.
  return typeof paramValue === 'string'
    ? paramValue
    : paramValue === null
      ? ''
      : paramValue.join('/')
}
