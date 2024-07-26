import type { OutgoingHttpHeaders } from 'http'
import type RenderResult from '../render-result'
import type { Revalidate } from '../lib/revalidate'
import type { RouteKind } from '../route-kind'

export interface ResponseCacheBase {
  get(
    key: string | null,
    responseGenerator: ResponseGenerator,
    context: {
      isOnDemandRevalidate?: boolean
      isPrefetch?: boolean
      incrementalCache: IncrementalCache
      /**
       * This is a hint to the cache to help it determine what kind of route
       * this is so it knows where to look up the cache entry from. If not
       * provided it will test the filesystem to check.
       */
      routeKind?: RouteKind

      isRoutePPREnabled?: boolean
    }
  ): Promise<ResponseCacheEntry | null>
}

// The server components HMR cache might store other data as well in the future,
// at which point this should be refactored to a discriminated union type.
export interface ServerComponentsHmrCache {
  get(key: string): CachedFetchData | undefined
  set(key: string, data: CachedFetchData): void
}

export type CachedFetchData = {
  headers: Record<string, string>
  body: string
  url: string
  status?: number
}

export interface CachedFetchValue {
  kind: 'FETCH'
  data: CachedFetchData
  // tags are only present with file-system-cache
  // fetch cache stores tags outside of cache entry
  tags?: string[]
  revalidate: number
}

export interface CachedRedirectValue {
  kind: 'REDIRECT'
  props: Object
}

export interface CachedAppPageValue {
  kind: 'APP_PAGE'
  // this needs to be a RenderResult so since renderResponse
  // expects that type instead of a string
  html: RenderResult
  rscData: Buffer | undefined
  status: number | undefined
  postponed: string | undefined
  headers: OutgoingHttpHeaders | undefined
}

export interface CachedPageValue {
  kind: 'PAGE'
  // this needs to be a RenderResult so since renderResponse
  // expects that type instead of a string
  html: RenderResult
  pageData: Object
  status: number | undefined
  headers: OutgoingHttpHeaders | undefined
}

export interface CachedRouteValue {
  kind: 'ROUTE'
  // this needs to be a RenderResult so since renderResponse
  // expects that type instead of a string
  body: Buffer
  status: number
  headers: OutgoingHttpHeaders
}

export interface CachedImageValue {
  kind: 'IMAGE'
  etag: string
  buffer: Buffer
  extension: string
  isMiss?: boolean
  isStale?: boolean
}

export interface IncrementalCachedAppPageValue {
  kind: 'APP_PAGE'
  // this needs to be a string since the cache expects to store
  // the string value
  html: string
  rscData: Buffer | undefined
  headers: OutgoingHttpHeaders | undefined
  postponed: string | undefined
  status: number | undefined
}

export interface IncrementalCachedPageValue {
  kind: 'PAGE'
  // this needs to be a string since the cache expects to store
  // the string value
  html: string
  pageData: Object
  headers: OutgoingHttpHeaders | undefined
  status: number | undefined
}

export type IncrementalCacheEntry = {
  curRevalidate?: Revalidate
  // milliseconds to revalidate after
  revalidateAfter: Revalidate
  // -1 here dictates a blocking revalidate should be used
  isStale?: boolean | -1
  value: IncrementalCacheValue | null
}

export type IncrementalCacheValue =
  | CachedRedirectValue
  | IncrementalCachedPageValue
  | IncrementalCachedAppPageValue
  | CachedImageValue
  | CachedFetchValue
  | CachedRouteValue

export type ResponseCacheValue =
  | CachedRedirectValue
  | CachedPageValue
  | CachedAppPageValue
  | CachedImageValue
  | CachedRouteValue

export type ResponseCacheEntry = {
  revalidate?: Revalidate
  value: ResponseCacheValue | null
  isStale?: boolean | -1
  isMiss?: boolean
}

/**
 * @param hasResolved whether the responseGenerator has resolved it's promise
 * @param previousCacheEntry the previous cache entry if it exists or the current
 */
export type ResponseGenerator = (
  hasResolved: boolean,
  previousCacheEntry?: IncrementalCacheItem,
  isRevalidating?: boolean
) => Promise<ResponseCacheEntry | null>

export type IncrementalCacheItem = {
  revalidateAfter?: number | false
  curRevalidate?: number | false
  revalidate?: number | false
  value: IncrementalCacheValue | null
  isStale?: boolean | -1
  isMiss?: boolean
} | null

export type IncrementalCacheKindHint = 'app' | 'pages' | 'fetch'

export interface IncrementalCache {
  get: (
    key: string,
    ctx?: {
      /**
       * The kind of cache entry to get. If not provided it will try to
       * determine the kind from the filesystem.
       */
      kindHint?: IncrementalCacheKindHint

      isRoutePPREnabled?: boolean
    }
  ) => Promise<IncrementalCacheItem>
  set: (
    key: string,
    data: IncrementalCacheValue | null,
    ctx: {
      revalidate: Revalidate
      isRoutePPREnabled?: boolean
    }
  ) => Promise<void>
}
