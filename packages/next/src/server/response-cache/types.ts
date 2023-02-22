import type RenderResult from '../render-result'

export interface ResponseCacheBase {
  get(
    key: string | null,
    responseGenerator: ResponseGenerator,
    context: {
      isManualRevalidate?: boolean
      isPrefetch?: boolean
      incrementalCache: IncrementalCache
    }
  ): Promise<ResponseCacheEntry | null>
}

export interface CachedFetchValue {
  kind: 'FETCH'
  data: {
    headers: { [k: string]: string }
    body: string
    status?: number
  }
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
  pageData: Object
}

export interface CachedRouteValue {
  kind: 'ROUTE'
  // this needs to be a RenderResult so since renderResponse
  // expects that type instead of a string
  body: Buffer
  status: number
  headers: Record<string, undefined | string | string[]>
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
}

export type IncrementalCacheEntry = {
  curRevalidate?: number | false
  // milliseconds to revalidate after
  revalidateAfter: number | false
  isStale?: boolean
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
  revalidate?: number | false
  value: ResponseCacheValue | null
  isStale?: boolean
  isMiss?: boolean
}

export type ResponseGenerator = (
  hasResolved: boolean,
  hadCache: boolean
) => Promise<ResponseCacheEntry | null>

export type IncrementalCacheItem = {
  revalidateAfter?: number | false
  curRevalidate?: number | false
  revalidate?: number | false
  value: IncrementalCacheValue | null
  isStale?: boolean
  isMiss?: boolean
} | null

export interface IncrementalCache {
  get: (key: string) => Promise<IncrementalCacheItem>
  set: (
    key: string,
    data: IncrementalCacheValue | null,
    revalidate?: number | false
  ) => Promise<void>
}
