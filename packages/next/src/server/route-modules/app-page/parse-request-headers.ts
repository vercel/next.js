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
  NEXT_ROUTER_PREFETCH_STATIC,
  NEXT_ROUTER_PREFETCH_RUNTIME_PREFETCH,
  NEXT_ROUTER_PREFETCH_RUNTIME_SHELL,
  NEXT_ROUTER_PREFETCH_RUNTIME_NAVIGATION,
} from '../../../client/components/app-router-headers'
import { AppStage } from '../../../client/components/segment-cache/types'
import { isRSCRequestHeader } from '../../lib/is-rsc-request'
import { getScriptNonceFromHeaders } from '../../app-render/get-script-nonce-from-header'
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
  /**
   * The stage a runtime prefetch asks for, or null if this isn't a runtime
   * prefetch. A runtime prefetch of the shell is rendered with params omitted
   * (any `await params` hangs forever), so it produces the param-independent
   * shell of the route.
   */
  readonly runtimePrefetchStage: AppStage | null
  readonly isRouteTreePrefetchRequest: boolean
  readonly isHmrRefresh: boolean
  readonly isRSCRequest: boolean
  readonly nonce: string | undefined
  readonly previouslyRevalidatedTags: string[]
  readonly requestId: string | undefined
  readonly htmlRequestId: string | undefined
}

/**
 * Whether the router state header is read for this request. Prefetches of
 * PPR-enabled routes don't depend on the client's router state.
 */
function shouldProvideFlightRouterState(
  isRSCRequest: boolean,
  isPrefetchRequest: boolean,
  isRoutePPREnabled: boolean
): boolean {
  return isRSCRequest && (!isPrefetchRequest || !isRoutePPREnabled)
}

/**
 * Returns true when the request carries a router state header that would be
 * used for rendering but can't be accepted (sent more than once, too large,
 * unparseable, or not matching the expected schema, e.g. because it was sent
 * by a client still running an older build after a deployment).
 *
 * This is invalid client input, so request handlers use this to respond with
 * a 400 before rendering instead of failing the render with a 500.
 */
export function hasInvalidFlightRouterStateHeader(
  headers: IncomingHttpHeaders,
  options: Pick<ParseRequestHeadersOptions, 'isRoutePPREnabled'>
): boolean {
  const stateHeader = headers[NEXT_ROUTER_STATE_TREE_HEADER]
  if (stateHeader === undefined) {
    return false
  }

  const isRSCRequest = isRSCRequestHeader(headers[RSC_HEADER])
  const isPrefetchRequest =
    isRSCRequest && headers[NEXT_ROUTER_PREFETCH_HEADER] === '1'
  if (
    !shouldProvideFlightRouterState(
      isRSCRequest,
      isPrefetchRequest,
      options.isRoutePPREnabled
    )
  ) {
    return false
  }

  try {
    parseAndValidateFlightRouterState(stateHeader)
    return false
  } catch {
    return true
  }
}

export function parseRequestHeaders(
  headers: IncomingHttpHeaders,
  options: ParseRequestHeadersOptions
): ParsedRequestHeaders {
  const isRSCRequest = isRSCRequestHeader(headers[RSC_HEADER])

  // runtime prefetch requests are *not* treated as prefetch requests
  // (TODO: this is confusing, we should refactor this to express this better)
  const isPrefetchRequest =
    isRSCRequest &&
    headers[NEXT_ROUTER_PREFETCH_HEADER] === NEXT_ROUTER_PREFETCH_STATIC

  let runtimePrefetchStage: AppStage | null = null
  if (isRSCRequest) {
    switch (headers[NEXT_ROUTER_PREFETCH_HEADER]) {
      case NEXT_ROUTER_PREFETCH_RUNTIME_SHELL:
        runtimePrefetchStage = AppStage.Shell
        break
      case NEXT_ROUTER_PREFETCH_RUNTIME_PREFETCH:
        runtimePrefetchStage = AppStage.Prefetch
        break
      case NEXT_ROUTER_PREFETCH_RUNTIME_NAVIGATION:
        runtimePrefetchStage = AppStage.Navigation
        break
      case undefined:
      default:
        break
    }
  }

  const isHmrRefresh = headers[NEXT_HMR_REFRESH_HEADER] !== undefined

  // Request handlers reject invalid headers with a 400 before rendering (see
  // `hasInvalidFlightRouterStateHeader`), so this only throws for callers that
  // don't perform that check.
  const flightRouterState = shouldProvideFlightRouterState(
    isRSCRequest,
    isPrefetchRequest,
    options.isRoutePPREnabled
  )
    ? parseAndValidateFlightRouterState(headers[NEXT_ROUTER_STATE_TREE_HEADER])
    : undefined

  // Checks if this is a prefetch of the Route Tree by the Segment Cache
  const isRouteTreePrefetchRequest =
    isRSCRequest && headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER] === '/_tree'

  const nonce = getScriptNonceFromHeaders(headers)

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
    runtimePrefetchStage,
    isRouteTreePrefetchRequest,
    isHmrRefresh,
    isRSCRequest,
    nonce,
    previouslyRevalidatedTags,
    requestId,
    htmlRequestId,
  }
}
