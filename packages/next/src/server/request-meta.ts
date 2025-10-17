import type { IncomingMessage } from 'http'
import type { ParsedUrlQuery } from 'querystring'
import type { UrlWithParsedQuery } from 'url'
import type { BaseNextRequest } from './base-http'
import type { CloneableBody } from './body-streams'
import type { RouteMatch } from './route-matches/route-match'
import type { NEXT_RSC_UNION_QUERY } from '../client/components/app-router-headers'
import type {
  ResponseCacheEntry,
  ServerComponentsHmrCache,
} from './response-cache'
import type { PagesDevOverlayBridgeType } from '../next-devtools/userspace/pages/pages-dev-overlay-setup'
import type { OpaqueFallbackRouteParams } from './request/fallback-params'
import type { IncrementalCache } from './lib/incremental-cache'

// FIXME: (wyattjoh) this is a temporary solution to allow us to pass data between bundled modules
export const NEXT_REQUEST_META = Symbol.for('NextInternalRequestMeta')

export type NextIncomingMessage = (BaseNextRequest | IncomingMessage) & {
  [NEXT_REQUEST_META]?: RequestMeta
}

/**
 * The callback function to call when a response cache entry was generated or
 * looked up in the cache. When it returns true, the server assumes that the
 * handler has already responded to the request and will not do so itself.
 */
export type OnCacheEntryHandler = (
  /**
   * The response cache entry that was generated or looked up in the cache.
   */
  cacheEntry: ResponseCacheEntry,

  /**
   * The request metadata.
   */
  requestMeta: {
    /**
     * The URL that was used to make the request.
     */
    url: string | undefined
  }
) => Promise<boolean | void> | boolean | void

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
  incrementalCache?: IncrementalCache

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
   * A search param set by the Next.js client when performing RSC requests.
   * Because some CDNs do not vary their cache entries on our custom headers,
   * this search param represents a hash of the header values. For any cached
   * RSC request, we should verify that the hash matches before responding.
   * Otherwise this can lead to cache poisoning.
   * TODO: Consider not using custom request headers at all, and instead encode
   * everything into the search param.
   */
  cacheBustingSearchParam?: string

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
   *
   * @deprecated Use `onCacheEntryV2` instead.
   */
  onCacheEntry?: OnCacheEntryHandler

  /**
   * If provided, this will be called when a response cache entry was generated
   * or looked up in the cache.
   */
  onCacheEntryV2?: OnCacheEntryHandler

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
   * Whether the request should render the fallback shell or not.
   */
  renderFallbackShell?: boolean

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

  /**
   * The relative project dir the server is running in from project root
   */
  relativeProjectDir?: string

  /**
   * The dist directory the server is currently using
   */
  distDir?: string

  /**
   * The query after resolving routes
   */
  query?: ParsedUrlQuery

  /**
   * The params after resolving routes
   */
  params?: ParsedUrlQuery

  /**
   * ErrorOverlay component to use in development for pages router
   */
  PagesErrorDebug?: PagesDevOverlayBridgeType

  /**
   * Whether server is in minimal mode (this will be replaced with more
   * specific flags in future)
   */
  minimalMode?: boolean

  /**
   * DEV only: The fallback params that should be used when validating prerenders during dev
   */
  devValidatingFallbackParams?: OpaqueFallbackRouteParams

  /**
   * DEV only: Request timings in process.hrtime.bigint()
   */
  devRequestTimingStart?: bigint
  devRequestTimingMiddlewareStart?: bigint
  devRequestTimingMiddlewareEnd?: bigint
  devRequestTimingInternalsEnd?: bigint
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

export type NextParsedUrlQuery = ParsedUrlQuery & NextQueryMetadata

export interface NextUrlWithParsedQuery extends UrlWithParsedQuery {
  query: NextParsedUrlQuery
}
