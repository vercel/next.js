import type { IncrementalCacheItem, ResponseCacheEntry } from './types'

import RenderResult from '../render-result'

export async function fromResponseCacheEntry(
  cacheEntry: ResponseCacheEntry
): Promise<IncrementalCacheItem> {
  return {
    ...cacheEntry,
    value:
      cacheEntry.value?.kind === 'PAGE'
        ? {
            kind: 'PAGE',
            html: await cacheEntry.value.html.toUnchunkedString(true),
            postponed: cacheEntry.value.postponed,
            pageData: cacheEntry.value.pageData,
            headers: cacheEntry.value.headers,
            status: cacheEntry.value.status,
          }
        : cacheEntry.value,
  }
}

export async function toResponseCacheEntry(
  response: IncrementalCacheItem
): Promise<ResponseCacheEntry | null> {
  if (!response) return null

  if (response.value?.kind === 'FETCH') {
    throw new Error(
      'Invariant: unexpected cachedResponse of kind fetch in response cache'
    )
  }

  return {
    isMiss: response.isMiss,
    isStale: response.isStale,
    revalidate: response.revalidate,
    value:
      response.value?.kind === 'PAGE'
        ? {
            kind: 'PAGE',
            html: RenderResult.fromStatic(response.value.html),
            pageData: response.value.pageData,
            postponed: response.value.postponed,
            headers: response.value.headers,
            status: response.value.status,
          }
        : response.value,
  }
}
