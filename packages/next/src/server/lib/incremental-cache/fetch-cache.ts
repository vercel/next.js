import type { CacheHandler, CacheHandlerContext, CacheHandlerValue } from './'
import type { IncrementalCacheValue } from '../../response-cache'

import LRUCache from 'next/dist/compiled/lru-cache'
import {
  CACHE_ONE_YEAR,
  NEXT_CACHE_SOFT_TAGS_HEADER,
} from '../../../lib/constants'

let rateLimitedUntil = 0
let memoryCache: LRUCache<string, CacheHandlerValue> | undefined

interface NextFetchCacheParams {
  internal?: boolean
  fetchType?: string
  fetchIdx?: number
  fetchUrl?: string
}

const CACHE_TAGS_HEADER = 'x-vercel-cache-tags' as const
const CACHE_HEADERS_HEADER = 'x-vercel-sc-headers' as const
const CACHE_STATE_HEADER = 'x-vercel-cache-state' as const
const CACHE_REVALIDATE_HEADER = 'x-vercel-revalidate' as const
const CACHE_FETCH_URL_HEADER = 'x-vercel-cache-item-name' as const
const CACHE_CONTROL_VALUE_HEADER = 'x-vercel-cache-control' as const

const DEBUG = Boolean(process.env.NEXT_PRIVATE_DEBUG_CACHE)

async function fetchRetryWithTimeout(
  url: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  retryIndex = 0
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, 500)

  return fetch(url, {
    ...(init || {}),
    signal: controller.signal,
  })
    .catch((err) => {
      if (retryIndex === 3) {
        throw err
      } else {
        if (DEBUG) {
          console.log(`Fetch failed for ${url} retry ${retryIndex}`)
        }
        return fetchRetryWithTimeout(url, init, retryIndex + 1)
      }
    })
    .finally(() => {
      clearTimeout(timeout)
    })
}

export default class FetchCache implements CacheHandler {
  private headers: Record<string, string>
  private cacheEndpoint?: string

  private hasMatchingTags(arr1: string[], arr2: string[]) {
    if (arr1.length !== arr2.length) return false

    const set1 = new Set(arr1)
    const set2 = new Set(arr2)

    if (set1.size !== set2.size) return false

    for (let tag of set1) {
      if (!set2.has(tag)) return false
    }

    return true
  }

  static isAvailable(ctx: {
    _requestHeaders: CacheHandlerContext['_requestHeaders']
  }) {
    return !!(
      ctx._requestHeaders['x-vercel-sc-host'] || process.env.SUSPENSE_CACHE_URL
    )
  }

  constructor(ctx: CacheHandlerContext) {
    this.headers = {}
    this.headers['Content-Type'] = 'application/json'

    if (CACHE_HEADERS_HEADER in ctx._requestHeaders) {
      const newHeaders = JSON.parse(
        ctx._requestHeaders[CACHE_HEADERS_HEADER] as string
      )
      for (const k in newHeaders) {
        this.headers[k] = newHeaders[k]
      }
      delete ctx._requestHeaders[CACHE_HEADERS_HEADER]
    }
    const scHost =
      ctx._requestHeaders['x-vercel-sc-host'] || process.env.SUSPENSE_CACHE_URL

    const scBasePath =
      ctx._requestHeaders['x-vercel-sc-basepath'] ||
      process.env.SUSPENSE_CACHE_BASEPATH

    if (process.env.SUSPENSE_CACHE_AUTH_TOKEN) {
      this.headers['Authorization'] =
        `Bearer ${process.env.SUSPENSE_CACHE_AUTH_TOKEN}`
    }

    if (scHost) {
      const scProto = process.env.SUSPENSE_CACHE_PROTO || 'https'
      this.cacheEndpoint = `${scProto}://${scHost}${scBasePath || ''}`
      if (DEBUG) {
        console.log('using cache endpoint', this.cacheEndpoint)
      }
    } else if (DEBUG) {
      console.log('no cache endpoint available')
    }

    if (ctx.maxMemoryCacheSize) {
      if (!memoryCache) {
        if (DEBUG) {
          console.log('using memory store for fetch cache')
        }

        memoryCache = new LRUCache({
          max: ctx.maxMemoryCacheSize,
          length({ value }) {
            if (!value) {
              return 25
            } else if (value.kind === 'REDIRECT') {
              return JSON.stringify(value.props).length
            } else if (value.kind === 'IMAGE') {
              throw new Error('invariant image should not be incremental-cache')
            } else if (value.kind === 'FETCH') {
              return JSON.stringify(value.data || '').length
            } else if (value.kind === 'ROUTE') {
              return value.body.length
            }
            // rough estimate of size of cache value
            return (
              value.html.length +
              (JSON.stringify(
                value.kind === 'APP_PAGE' ? value.rscData : value.pageData
              )?.length || 0)
            )
          },
        })
      }
    } else {
      if (DEBUG) {
        console.log('not using memory store for fetch cache')
      }
    }
  }

  public resetRequestCache(): void {
    memoryCache?.reset()
  }

  public async revalidateTag(
    ...args: Parameters<CacheHandler['revalidateTag']>
  ) {
    let [tags] = args
    tags = typeof tags === 'string' ? [tags] : tags
    if (DEBUG) {
      console.log('revalidateTag', tags)
    }

    if (!tags.length) return

    if (Date.now() < rateLimitedUntil) {
      if (DEBUG) {
        console.log('rate limited ', rateLimitedUntil)
      }
      return
    }

    try {
      const res = await fetchRetryWithTimeout(
        `${this.cacheEndpoint}/v1/suspense-cache/revalidate?tags=${tags
          .map((tag) => encodeURIComponent(tag))
          .join(',')}`,
        {
          method: 'POST',
          headers: this.headers,
          // @ts-expect-error not on public type
          next: { internal: true },
        }
      )

      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after') || '60000'
        rateLimitedUntil = Date.now() + parseInt(retryAfter)
      }

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}.`)
      }
    } catch (err) {
      console.warn(`Failed to revalidate tag ${tags}`, err)
    }
  }

  public async get(...args: Parameters<CacheHandler['get']>) {
    const [key, ctx = {}] = args
    const { tags, softTags, kindHint, fetchIdx, fetchUrl } = ctx

    if (kindHint !== 'fetch') {
      return null
    }

    if (Date.now() < rateLimitedUntil) {
      if (DEBUG) {
        console.log('rate limited')
      }
      return null
    }

    // memory cache is cleared at the end of each request
    // so that revalidate events are pulled from upstream
    // on successive requests
    let data = memoryCache?.get(key)

    const hasFetchKindAndMatchingTags =
      data?.value?.kind === 'FETCH' &&
      this.hasMatchingTags(tags ?? [], data.value.tags ?? [])

    // Get data from fetch cache. Also check if new tags have been
    // specified with the same cache key (fetch URL)
    if (this.cacheEndpoint && (!data || !hasFetchKindAndMatchingTags)) {
      try {
        const start = Date.now()
        const fetchParams: NextFetchCacheParams = {
          internal: true,
          fetchType: 'cache-get',
          fetchUrl: fetchUrl,
          fetchIdx,
        }
        const res = await fetch(
          `${this.cacheEndpoint}/v1/suspense-cache/${key}`,
          {
            method: 'GET',
            headers: {
              ...this.headers,
              [CACHE_FETCH_URL_HEADER]: fetchUrl,
              [CACHE_TAGS_HEADER]: tags?.join(',') || '',
              [NEXT_CACHE_SOFT_TAGS_HEADER]: softTags?.join(',') || '',
            } as any,
            next: fetchParams as NextFetchRequestConfig,
          }
        )

        if (res.status === 429) {
          const retryAfter = res.headers.get('retry-after') || '60000'
          rateLimitedUntil = Date.now() + parseInt(retryAfter)
        }

        if (res.status === 404) {
          if (DEBUG) {
            console.log(
              `no fetch cache entry for ${key}, duration: ${
                Date.now() - start
              }ms`
            )
          }
          return null
        }

        if (!res.ok) {
          console.error(await res.text())
          throw new Error(`invalid response from cache ${res.status}`)
        }

        const cached: IncrementalCacheValue = await res.json()

        if (!cached || cached.kind !== 'FETCH') {
          DEBUG && console.log({ cached })
          throw new Error('invalid cache value')
        }

        // if new tags were specified, merge those tags to the existing tags
        if (cached.kind === 'FETCH') {
          cached.tags ??= []
          for (const tag of tags ?? []) {
            if (!cached.tags.includes(tag)) {
              cached.tags.push(tag)
            }
          }
        }

        const cacheState = res.headers.get(CACHE_STATE_HEADER)
        const age = res.headers.get('age')

        data = {
          value: cached,
          // if it's already stale set it to a time in the past
          // if not derive last modified from age
          lastModified:
            cacheState !== 'fresh'
              ? Date.now() - CACHE_ONE_YEAR
              : Date.now() - parseInt(age || '0', 10) * 1000,
        }

        if (DEBUG) {
          console.log(
            `got fetch cache entry for ${key}, duration: ${
              Date.now() - start
            }ms, size: ${
              Object.keys(cached).length
            }, cache-state: ${cacheState} tags: ${tags?.join(
              ','
            )} softTags: ${softTags?.join(',')}`
          )
        }

        if (data) {
          memoryCache?.set(key, data)
        }
      } catch (err) {
        // unable to get data from fetch-cache
        if (DEBUG) {
          console.error(`Failed to get from fetch-cache`, err)
        }
      }
    }

    return data || null
  }

  public async set(...args: Parameters<CacheHandler['set']>) {
    const [key, data, ctx] = args

    const newValue = data?.kind === 'FETCH' ? data.data : undefined
    const existingCache = memoryCache?.get(key)
    const existingValue = existingCache?.value
    if (
      existingValue?.kind === 'FETCH' &&
      Object.keys(existingValue.data).every(
        (field) =>
          JSON.stringify(
            (existingValue.data as Record<string, string | Object>)[field]
          ) ===
          JSON.stringify((newValue as Record<string, string | Object>)[field])
      )
    ) {
      if (DEBUG) {
        console.log(`skipping cache set for ${key} as not modified`)
      }
      return
    }

    const { fetchCache, fetchIdx, fetchUrl, tags } = ctx
    if (!fetchCache) return

    if (Date.now() < rateLimitedUntil) {
      if (DEBUG) {
        console.log('rate limited')
      }
      return
    }

    memoryCache?.set(key, {
      value: data,
      lastModified: Date.now(),
    })

    if (this.cacheEndpoint) {
      try {
        const start = Date.now()
        if (data !== null && 'revalidate' in data) {
          this.headers[CACHE_REVALIDATE_HEADER] = data.revalidate.toString()
        }
        if (
          !this.headers[CACHE_REVALIDATE_HEADER] &&
          data !== null &&
          'data' in data
        ) {
          this.headers[CACHE_CONTROL_VALUE_HEADER] =
            data.data.headers['cache-control']
        }
        const body = JSON.stringify({
          ...data,
          // we send the tags in the header instead
          // of in the body here
          tags: undefined,
        })

        if (DEBUG) {
          console.log('set cache', key)
        }
        const fetchParams: NextFetchCacheParams = {
          internal: true,
          fetchType: 'cache-set',
          fetchUrl,
          fetchIdx,
        }
        const res = await fetch(
          `${this.cacheEndpoint}/v1/suspense-cache/${key}`,
          {
            method: 'POST',
            headers: {
              ...this.headers,
              [CACHE_FETCH_URL_HEADER]: fetchUrl || '',
              [CACHE_TAGS_HEADER]: tags?.join(',') || '',
            },
            body: body,
            next: fetchParams as NextFetchRequestConfig,
          }
        )

        if (res.status === 429) {
          const retryAfter = res.headers.get('retry-after') || '60000'
          rateLimitedUntil = Date.now() + parseInt(retryAfter)
        }

        if (!res.ok) {
          DEBUG && console.log(await res.text())
          throw new Error(`invalid response ${res.status}`)
        }

        if (DEBUG) {
          console.log(
            `successfully set to fetch-cache for ${key}, duration: ${
              Date.now() - start
            }ms, size: ${body.length}`
          )
        }
      } catch (err) {
        // unable to set to fetch-cache
        if (DEBUG) {
          console.error(`Failed to update fetch cache`, err)
        }
      }
    }
    return
  }
}
