import type { OutgoingHttpHeaders } from 'http'
import type RenderResult from '../render-result'
import type { Revalidate } from '../lib/revalidate'
import type { RouteKind } from '../../server/future/route-kind'

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
    }
  ): Promise<ResponseCacheEntry | null>
}

export interface CachedFetchValue {
  kind: 'FETCH'
  data: {
    headers: { [k: string]: string }
    body: string
    url: string
    status?: number
  }
  // tags are only present with file-system-cache
  // fetch cache stores tags outside of cache entry
  tags?: string[]
  revalidate: number
}

export interface CachedRedirectValue {
  kind: 'REDIRECT'
  props: Object
}

interface CachedPageValue {
  kind: 'PAGE'
  // this needs to be a RenderResult so since renderResponse
  // expects that type instead of a string
  html: RenderResult
  postponed: string | undefined
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

interface IncrementalCachedPageValue {
  kind: 'PAGE'
  // this needs to be a string since the cache expects to store
  // the string value
  html: string
  pageData: Object
  postponed: string | undefined
  headers: OutgoingHttpHeaders | undefined
  status: number | undefined
}

export type IncrementalCacheEntry = {
  curRevalidate?: number | false
  // milliseconds to revalidate after
  revalidateAfter: number | false
  // -1 here dictates a blocking revalidate should be used
  isStale?: boolean | -1
  value: IncrementalCacheValue | null
}

export type IncrementalCacheValue =
  | CachedRedirectValue
  | IncrementalCachedPageValue
  | CachedImageValue
  | CachedFetchValue
  | CachedRouteValue

export type ResponseCacheValue =
  | CachedRedirectValue
  | CachedPageValue
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
    }
  ) => Promise<IncrementalCacheItem>
  set: (
    key: string,
    data: IncrementalCacheValue | null,
    ctx: { revalidate: Revalidate }
  ) => Promise<void>
}
