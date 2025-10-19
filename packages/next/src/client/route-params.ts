import type { DynamicParamTypesShort } from '../shared/lib/app-router-types'
import {
  addSearchParamsIfPageSegment,
  DEFAULT_SEGMENT_KEY,
  PAGE_SEGMENT_KEY,
} from '../shared/lib/segment'
import { ROOT_SEGMENT_REQUEST_KEY } from '../shared/lib/segment-cache/segment-value-encoding'
import {
  NEXT_REWRITTEN_PATH_HEADER,
  NEXT_REWRITTEN_QUERY_HEADER,
  NEXT_RSC_UNION_QUERY,
} from './components/app-router-headers'
import type { NormalizedSearch } from './components/segment-cache'
import type { RSCResponse } from './components/router-reducer/fetch-server-response'
import type { ParsedUrlQuery } from 'querystring'

export type RouteParamValue = string | Array<string> | null

export type RouteParam = {
  name: string
  value: RouteParamValue
  type: DynamicParamTypesShort
}

export function getRenderedSearch(
  response: RSCResponse<unknown> | Response
): NormalizedSearch {
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
  return urlToUrlWithoutFlightMarker(new URL(response.url))
    .search as NormalizedSearch
}

export function getRenderedPathname(
  response: RSCResponse<unknown> | Response
): string {
  // If the server performed a rewrite, the pathname used to render the
  // page will be different from the pathname in the request URL. In this case,
  // the response will include a header that gives the rewritten pathname.
  const rewrittenPath = response.headers.get(NEXT_REWRITTEN_PATH_HEADER)
  return (
    rewrittenPath ?? urlToUrlWithoutFlightMarker(new URL(response.url)).pathname
  )
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
    (segment[0] === '(' && segment.endsWith(')')) ||
    segment === DEFAULT_SEGMENT_KEY ||
    segment === '/_not-found'
  ) {
    return false
  } else {
    // All other segment types appear in the URL
    return true
  }
}

export function getCacheKeyForDynamicParam(
  paramValue: RouteParamValue,
  renderedSearch: NormalizedSearch
): string {
  // This needs to match the logic in get-dynamic-param.ts, until we're able to
  // unify the various implementations so that these are always computed on
  // the client.
  if (typeof paramValue === 'string') {
    // TODO: Refactor or remove this helper function to accept a string rather
    // than the whole segment type. Also we can probably just append the
    // search string instead of turning it into JSON.
    const pageSegmentWithSearchParams = addSearchParamsIfPageSegment(
      paramValue,
      Object.fromEntries(new URLSearchParams(renderedSearch))
    ) as string
    return pageSegmentWithSearchParams
  } else if (paramValue === null) {
    return ''
  } else {
    return paramValue.join('/')
  }
}

export function urlToUrlWithoutFlightMarker(url: URL): URL {
  const urlWithoutFlightParameters = new URL(url)
  urlWithoutFlightParameters.searchParams.delete(NEXT_RSC_UNION_QUERY)
  if (process.env.NODE_ENV === 'production') {
    if (
      process.env.__NEXT_CONFIG_OUTPUT === 'export' &&
      urlWithoutFlightParameters.pathname.endsWith('.txt')
    ) {
      const { pathname } = urlWithoutFlightParameters
      const length = pathname.endsWith('/index.txt') ? 10 : 4
      // Slice off `/index.txt` or `.txt` from the end of the pathname
      urlWithoutFlightParameters.pathname = pathname.slice(0, -length)
    }
  }
  return urlWithoutFlightParameters
}

export function getParamValueFromCacheKey(
  paramCacheKey: string,
  paramType: DynamicParamTypesShort
) {
  // Turn the cache key string sent by the server (as part of FlightRouterState)
  // into a value that can be passed to `useParams` and client components.
  const isCatchAll = paramType === 'c' || paramType === 'oc'
  if (isCatchAll) {
    // Catch-all param keys are a concatenation of the path segments.
    // See equivalent logic in `getSelectedParams`.
    // TODO: We should just pass the array directly, rather than concatenate
    // it to a string and then split it back to an array. It needs to be an
    // array in some places, like when passing a key React, but we can convert
    // it at runtime in those places.
    return paramCacheKey.split('/')
  }
  return paramCacheKey
}

export function urlSearchParamsToParsedUrlQuery(
  searchParams: URLSearchParams
): ParsedUrlQuery {
  // Converts a URLSearchParams object to the same type used by the server when
  // creating search params props, i.e. the type returned by Node's
  // "querystring" module.
  const result: ParsedUrlQuery = {}
  for (const [key, value] of searchParams.entries()) {
    if (result[key] === undefined) {
      result[key] = value
    } else if (Array.isArray(result[key])) {
      result[key].push(value)
    } else {
      result[key] = [result[key], value]
    }
  }
  return result
}
