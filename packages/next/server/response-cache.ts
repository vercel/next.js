import { IncrementalCache } from './incremental-cache'
import { ReplaySubject, firstValueFrom } from 'rxjs'

interface CachedRedirectValue {
  kind: 'REDIRECT'
  props: Object
}

interface CachedPageValue {
  kind: 'PAGE'
  html: string
  pageData: Object
}

export type ResponseCacheValue = CachedRedirectValue | CachedPageValue

export type ResponseCacheEntry = {
  revalidate?: number | false
  value: ResponseCacheValue | null
}

type ResponseGenerator = (hasResolved: boolean) => Promise<ResponseCacheEntry>

export default class ResponseCache {
  incrementalCache: IncrementalCache
  pendingResponses: Map<string, ReplaySubject<ResponseCacheEntry>>

  constructor(incrementalCache: IncrementalCache) {
    this.incrementalCache = incrementalCache
    this.pendingResponses = new Map()
  }

  public get(
    key: string | null,
    responseGenerator: ResponseGenerator
  ): Promise<ResponseCacheEntry> {
    const pendingResponse = key ? this.pendingResponses.get(key) : null
    if (pendingResponse) {
      return firstValueFrom(pendingResponse)
    }

    const response: ReplaySubject<ResponseCacheEntry> = new ReplaySubject(1)
    if (key) {
      this.pendingResponses.set(key, response)
    }

    let resolved = false
    const resolve = (cacheEntry: ResponseCacheEntry) => {
      resolved = true
      response.next(cacheEntry)
    }

    // We wait to do any async work until after we've added our promise to
    // `pendingResponses` to ensure that any any other calls will reuse the
    // same promise until we've fully finished our work.
    ;(async () => {
      try {
        const cachedResponse = key ? await this.incrementalCache.get(key) : null
        if (cachedResponse) {
          resolve({
            revalidate: cachedResponse.curRevalidate,
            value: cachedResponse.value,
          })
          if (!cachedResponse.isStale) {
            // The cached value is still valid, so we don't need
            // to update it yet.
            return
          }
        }

        const cacheEntry = await responseGenerator(resolved)
        resolve(cacheEntry)

        if (key && typeof cacheEntry.revalidate !== 'undefined') {
          await this.incrementalCache.set(
            key,
            cacheEntry.value,
            cacheEntry.revalidate
          )
        }
      } catch (err) {
        response.error(err)
      } finally {
        if (!response.closed) {
          response.complete()
        }
        if (key) {
          this.pendingResponses.delete(key)
        }
      }
    })()
    return firstValueFrom(response)
  }
}
