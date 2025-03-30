/* eslint-disable no-redeclare */
import type { IncomingMessage } from 'http'
import type { ParsedUrlQuery } from 'querystring'
import type { UrlWithParsedQuery } from 'url'
import type { BaseNextRequest } from './base-http'
import type { CloneableBody } from './body-streams'
import type { RouteMatch } from './route-matches/route-match'
import type { NEXT_RSC_UNION_QUERY } from '../client/components/app-router-headers'
import type { ServerComponentsHmrCache } from './response-cache'

// FIXME: (wyattjoh) this is a temporary solution to allow us to pass data between bundled modules
export const NEXT_REQUEST_META = Symbol.for('NextInternalRequestMeta')

export type NextIncomingMessage = (BaseNextRequest | IncomingMessage) & {
  [NEXT_REQUEST_META]?: RequestMeta
}

export interface RequestMeta {
  /**
   * The query that was used to make the request.
   */
  initQuery?: ParsedUrlQuery

  /**
   * The URL that was used to make the request.
   */
  initURL?: string

  /**
   * The protocol that was used to make the request.
   */
  initProtocol?: string

  /**
   * The body that was read from the request. This is used to allow the body to
   * be read multiple times.
   */
  clonableBody?: CloneableBody

  /**
   * True when the request matched a locale domain that was configured in the
   * next.config.js file.
   */
  isLocaleDomain?: boolean

  /**
   * True when the request had locale information stripped from the pathname
   * part of the URL.
   */
  didStripLocale?: boolean

  /**
   * If the request had it's URL rewritten, this is the URL it was rewritten to.
   */
  rewroteURL?: string

  /**
   * The cookies that were added by middleware and were added to the response.
   */
  middlewareCookie?: string[]

  /**
   * The match on the request for a given route.
   */
  match?: RouteMatch

  /**
   * The incremental cache to use for the request.
   */
  incrementalCache?: any

  /**
   * The server components HMR cache, only for dev.
   */
  serverComponentsHmrCache?: ServerComponentsHmrCache

  /**
   * Equals the segment path that was used for the prefetch RSC request.
   */
  segmentPrefetchRSCRequest?: string

  /**
   * True when the request is for the prefetch flight data.
   */
  isPrefetchRSCRequest?: true

  /**
   * True when the request is for the flight data.
   */
  isRSCRequest?: true

  /**
   * True when the request is for the `/_next/data` route using the pages
   * router.
   */
  isNextDataReq?: true

  /**
   * Postponed state to use for resumption. If present it's assumed that the
   * request is for a page that has postponed (there are no guarantees that the
   * page actually has postponed though as it would incur an additional cache
   * lookup).
   */
  postponed?: string

  /**
   * If provided, this will be called when a response cache entry was generated
   * or looked up in the cache.
   */
  onCacheEntry?: (
    cacheEntry: any,
    requestMeta: any
  ) => Promise<boolean | void> | boolean | void

  /**
   * The previous revalidate before rendering 404 page for notFound: true
   */
  notFoundRevalidate?: number | false

  /**
   * In development, the original source page that returned a 404.
   */
  developmentNotFoundSourcePage?: string

  /**
   * The path we routed to and should be invoked
   */
  invokePath?: string

  /**
   * The specific page output we should be matching
   */
  invokeOutput?: string

  /**
   * The status we are invoking the request with from routing
   */
  invokeStatus?: number

  /**
   * The routing error we are invoking with
   */
  invokeError?: Error

  /**
   * The query parsed for the invocation
   */
  invokeQuery?: Record<string, undefined | string | string[]>

  /**
   * Whether the request is a middleware invocation
   */
  middlewareInvoke?: boolean

  /**
   * Whether the default route matches were set on the request during routing.
   */
  didSetDefaultRouteMatches?: boolean

  /**
   * Whether the request is for the custom error page.
   */
  customErrorRender?: true

  /**
   * Whether to bubble up the NoFallbackError to the caller when a 404 is
   * returned.
   */
  bubbleNoFallback?: true

  /**
   * True when the request had locale information inferred from the default
   * locale.
   */
  localeInferredFromDefault?: true

  /**
   * The locale that was inferred or explicitly set for the request.
   */
  locale?: string

  /**
   * The default locale that was inferred or explicitly set for the request.
   */
  defaultLocale?: string
}

/**
 * Gets the request metadata. If no key is provided, the entire metadata object
 * is returned.
 *
 * @param req the request to get the metadata from
 * @param key the key to get from the metadata (optional)
 * @returns the value for the key or the entire metadata object
 */
export function getRequestMeta(
  req: NextIncomingMessage,
  key?: undefined
): RequestMeta
export function getRequestMeta<K extends keyof RequestMeta>(
  req: NextIncomingMessage,
  key: K
): RequestMeta[K]
export function getRequestMeta<K extends keyof RequestMeta>(
  req: NextIncomingMessage,
  key?: K
): RequestMeta | RequestMeta[K] {
  const meta = req[NEXT_REQUEST_META] || {}
  return typeof key === 'string' ? meta[key] : meta
}

/**
 * Sets the request metadata.
 *
 * @param req the request to set the metadata on
 * @param meta the metadata to set
 * @returns the mutated request metadata
 */
export function setRequestMeta(req: NextIncomingMessage, meta: RequestMeta) {
  req[NEXT_REQUEST_META] = meta
  return meta
}

/**
 * Adds a value to the request metadata.
 *
 * @param request the request to mutate
 * @param key the key to set
 * @param value the value to set
 * @returns the mutated request metadata
 */
export function addRequestMeta<K extends keyof RequestMeta>(
  request: NextIncomingMessage,
  key: K,
  value: RequestMeta[K]
) {
  const meta = getRequestMeta(request)
  meta[key] = value
  return setRequestMeta(request, meta)
}

/**
 * Removes a key from the request metadata.
 *
 * @param request the request to mutate
 * @param key the key to remove
 * @returns the mutated request metadata
 */
export function removeRequestMeta<K extends keyof RequestMeta>(
  request: NextIncomingMessage,
  key: K
) {
  const meta = getRequestMeta(request)
  delete meta[key]
  return setRequestMeta(request, meta)
}

type NextQueryMetadata = {
  /**
   * The `_rsc` query parameter used for cache busting to ensure that the RSC
   * requests do not get cached by the browser explicitly.
   */
  [NEXT_RSC_UNION_QUERY]?: string
}

export type NextParsedUrlQuery = ParsedUrlQuery &
  NextQueryMetadata & {
    amp?: '1'
  }

export interface NextUrlWithParsedQuery extends UrlWithParsedQuery {
  query: NextParsedUrlQuery
}
