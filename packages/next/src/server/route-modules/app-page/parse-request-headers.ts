import type { IncomingHttpHeaders } from 'http'
import type { FlightRouterState } from '../../../shared/lib/app-router-types'
import {
  NEXT_HMR_REFRESH_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  RSC_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_REQUEST_ID_HEADER,
  NEXT_HTML_REQUEST_ID_HEADER,
} from '../../../client/components/app-router-headers'
import { isRSCRequestHeader } from '../../lib/is-rsc-request'
import { getScriptNonceFromHeader } from '../../app-render/get-script-nonce-from-header'
import { parseAndValidateFlightRouterState } from '../../app-render/parse-and-validate-flight-router-state'
import { getPreviouslyRevalidatedTags } from '../../server-utils'

interface ParseRequestHeadersOptions {
  readonly isRoutePPREnabled: boolean
  readonly previewModeId: string | undefined
}

export interface ParsedRequestHeaders {
  /**
   * Router state provided from the client-side router. Used to handle rendering
   * from the common layout down. This value will be undefined if the request is
   * not a client-side navigation request, or if the request is a prefetch
   * request.
   */
  readonly flightRouterState: FlightRouterState | undefined
  readonly isPrefetchRequest: boolean
  readonly isRuntimePrefetchRequest: boolean
  /**
   * App Shell prefetch: a runtime prefetch that the server renders with
   * params omitted (any `await params` hangs forever). Produces the
   * param-independent shell of the route. Implies isRuntimePrefetchRequest.
   */
  readonly isAppShellPrefetchRequest: boolean
  readonly isRouteTreePrefetchRequest: boolean
  readonly isHmrRefresh: boolean
  readonly isRSCRequest: boolean
  readonly nonce: string | undefined
  readonly previouslyRevalidatedTags: string[]
  readonly requestId: string | undefined
  readonly htmlRequestId: string | undefined
}

export function parseRequestHeaders(
  headers: IncomingHttpHeaders,
  options: ParseRequestHeadersOptions
): ParsedRequestHeaders {
  const isRSCRequest = isRSCRequestHeader(headers[RSC_HEADER])

  // runtime prefetch requests are *not* treated as prefetch requests
  // (TODO: this is confusing, we should refactor this to express this better)
  const isPrefetchRequest =
    isRSCRequest && headers[NEXT_ROUTER_PREFETCH_HEADER] === '1'

  const isAppShellPrefetchRequest =
    isRSCRequest && headers[NEXT_ROUTER_PREFETCH_HEADER] === '3'

  // App Shell prefetches are a subtype of runtime prefetch — same code path,
  // but with less resolved content (omitting link data)
  const isRuntimePrefetchRequest =
    isRSCRequest &&
    (headers[NEXT_ROUTER_PREFETCH_HEADER] === '2' || isAppShellPrefetchRequest)

  const isHmrRefresh = headers[NEXT_HMR_REFRESH_HEADER] !== undefined

  const shouldProvideFlightRouterState =
    isRSCRequest && (!isPrefetchRequest || !options.isRoutePPREnabled)

  const flightRouterState = shouldProvideFlightRouterState
    ? parseAndValidateFlightRouterState(headers[NEXT_ROUTER_STATE_TREE_HEADER])
    : undefined

  // Checks if this is a prefetch of the Route Tree by the Segment Cache
  const isRouteTreePrefetchRequest =
    isRSCRequest && headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER] === '/_tree'

  const csp =
    headers['content-security-policy'] ||
    headers['content-security-policy-report-only']

  const nonce =
    typeof csp === 'string' ? getScriptNonceFromHeader(csp) : undefined

  const previouslyRevalidatedTags = getPreviouslyRevalidatedTags(
    headers,
    options.previewModeId
  )

  let requestId: string | undefined
  let htmlRequestId: string | undefined

  if (process.env.__NEXT_DEV_SERVER) {
    // The request IDs are only used for the dev server to send debug
    // information to the matching client (identified by the HTML request ID
    // that was sent to the client with the HTML document) for the current
    // request (identified by the request ID, as defined by the client).

    requestId =
      typeof headers[NEXT_REQUEST_ID_HEADER] === 'string'
        ? headers[NEXT_REQUEST_ID_HEADER]
        : undefined

    htmlRequestId =
      typeof headers[NEXT_HTML_REQUEST_ID_HEADER] === 'string'
        ? headers[NEXT_HTML_REQUEST_ID_HEADER]
        : undefined
  }

  return {
    flightRouterState,
    isPrefetchRequest,
    isRuntimePrefetchRequest,
    isAppShellPrefetchRequest,
    isRouteTreePrefetchRequest,
    isHmrRefresh,
    isRSCRequest,
    nonce,
    previouslyRevalidatedTags,
    requestId,
    htmlRequestId,
  }
}
