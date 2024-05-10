/* eslint-disable no-redeclare */
import type { IncomingMessage } from 'http'
import type { ParsedUrlQuery } from 'querystring'
import type { UrlWithParsedQuery } from 'url'
import type { BaseNextRequest } from './base-http'
import type { CloneableBody } from './body-streams'
import type { RouteMatch } from './future/route-matches/route-match'
import type { NEXT_RSC_UNION_QUERY } from '../client/components/app-router-headers'

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
   * The route that was provided via the `x-invoke-output` header.
   */
  invokeOutput?: string

  /**
   * True when the route that was provided via the `x-invoke-output` header is
   * dynamic.
   */
  invokeOutputDynamic?: boolean

  /**
   * The incremental cache to use for the request.
   */
  incrementalCache?: any

  /**
   * True when the request is for the prefetch flight data.
   */
  isPrefetchRSCRequest?: true

  /**
   * True when the request is for the flight data.
   */
  isRSCRequest?: true

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
  __nextNotFoundSrcPage?: string
  __nextDefaultLocale?: string
  __nextFallback?: 'true'

  /**
   * The locale that was inferred or explicitly set for the request.
   *
   * When this property is mutated, it's important to also update the request
   * metadata for `_nextInferredDefaultLocale` to ensure that the correct
   * behavior is applied.
   */
  __nextLocale?: string

  /**
   * `1` when the request did not have a locale in the pathname part of the
   * URL but the default locale was inferred from either the domain or the
   * configuration.
   */
  __nextInferredLocaleFromDefault?: '1'

  __nextSsgPath?: string
  _nextBubbleNoFallback?: '1'

  /**
   * When set to `1`, the request is for the `/_next/data` route using the pages
   * router.
   */
  __nextDataReq?: '1'
  __nextCustomErrorRender?: '1'
  [NEXT_RSC_UNION_QUERY]?: string
}

export type NextParsedUrlQuery = ParsedUrlQuery &
  NextQueryMetadata & {
    amp?: '1'
  }

export interface NextUrlWithParsedQuery extends UrlWithParsedQuery {
  query: NextParsedUrlQuery
}

export function getNextInternalQuery(
  query: NextParsedUrlQuery
): NextQueryMetadata {
  const keysToInclude: (keyof NextQueryMetadata)[] = [
    '__nextDefaultLocale',
    '__nextFallback',
    '__nextLocale',
    '__nextSsgPath',
    '_nextBubbleNoFallback',
    '__nextDataReq',
    '__nextInferredLocaleFromDefault',
  ]
  const nextInternalQuery: NextQueryMetadata = {}

  for (const key of keysToInclude) {
    if (key in query) {
      // @ts-ignore this can't be typed correctly
      nextInternalQuery[key] = query[key]
    }
  }

  return nextInternalQuery
}
