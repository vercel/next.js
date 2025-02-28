import {
  CachedRouteKind,
  IncrementalCacheKind,
  type CachedAppPageValue,
  type CachedPageValue,
  type IncrementalResponseCacheEntry,
  type ResponseCacheEntry,
} from './types'

import RenderResult from '../render-result'
import { RouteKind } from '../route-kind'

export async function fromResponseCacheEntry(
  cacheEntry: ResponseCacheEntry
): Promise<IncrementalResponseCacheEntry> {
  return {
    ...cacheEntry,
    value:
      cacheEntry.value?.kind === CachedRouteKind.PAGES
        ? {
            kind: CachedRouteKind.PAGES,
            html: await cacheEntry.value.html.toUnchunkedString(true),
            pageData: cacheEntry.value.pageData,
            headers: cacheEntry.value.headers,
            status: cacheEntry.value.status,
          }
        : cacheEntry.value?.kind === CachedRouteKind.APP_PAGE
          ? {
              kind: CachedRouteKind.APP_PAGE,
              html: await cacheEntry.value.html.toUnchunkedString(true),
              postponed: cacheEntry.value.postponed,
              rscData: cacheEntry.value.rscData,
              headers: cacheEntry.value.headers,
              status: cacheEntry.value.status,
              segmentData: cacheEntry.value.segmentData,
            }
          : cacheEntry.value,
  }
}

export async function toResponseCacheEntry(
  response: IncrementalResponseCacheEntry | null
): Promise<ResponseCacheEntry | null> {
  if (!response) return null

  return {
    isMiss: response.isMiss,
    isStale: response.isStale,
    revalidate: response.revalidate,
    isFallback: response.isFallback,
    value:
      response.value?.kind === CachedRouteKind.PAGES
        ? ({
            kind: CachedRouteKind.PAGES,
            html: RenderResult.fromStatic(response.value.html),
            pageData: response.value.pageData,
            headers: response.value.headers,
            status: response.value.status,
          } satisfies CachedPageValue)
        : response.value?.kind === CachedRouteKind.APP_PAGE
          ? ({
              kind: CachedRouteKind.APP_PAGE,
              html: RenderResult.fromStatic(response.value.html),
              rscData: response.value.rscData,
              headers: response.value.headers,
              status: response.value.status,
              postponed: response.value.postponed,
              segmentData: response.value.segmentData,
            } satisfies CachedAppPageValue)
          : response.value,
  }
}

export function routeKindToIncrementalCacheKind(
  routeKind: RouteKind
): Exclude<IncrementalCacheKind, IncrementalCacheKind.FETCH> {
  switch (routeKind) {
    case RouteKind.PAGES:
      return IncrementalCacheKind.PAGES
    case RouteKind.APP_PAGE:
      return IncrementalCacheKind.APP_PAGE
    case RouteKind.IMAGE:
      return IncrementalCacheKind.IMAGE
    case RouteKind.APP_ROUTE:
      return IncrementalCacheKind.APP_ROUTE
    default:
      throw new Error(`Unexpected route kind ${routeKind}`)
  }
}
