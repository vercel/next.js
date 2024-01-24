import type { CacheHandler, CacheHandlerContext, CacheHandlerValue } from './'

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

export default class FetchCache implements CacheHandler {
  private headers: Record<string, string>
  private cacheEndpoint?: string
  private debug: boolean

  static isAvailable(ctx: {
    _requestHeaders: CacheHandlerContext['_requestHeaders']
  }) {
    return !!(
      ctx._requestHeaders['x-vercel-sc-host'] || process.env.SUSPENSE_CACHE_URL
    )
  }

  constructor(ctx: CacheHandlerContext) {
    this.debug = !!process.env.NEXT_PRIVATE_DEBUG_CACHE
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
      this.headers[
        'Authorization'
      ] = `Bearer ${process.env.SUSPENSE_CACHE_AUTH_TOKEN}`
    }

    if (scHost) {
      this.cacheEndpoint = `https://${scHost}${scBasePath || ''}`
      if (this.debug) {
        console.log('using cache endpoint', this.cacheEndpoint)
      }
    } else if (this.debug) {
      console.log('no cache endpoint available')
    }

    if (ctx.maxMemoryCacheSize) {
      if (!memoryCache) {
        if (this.debug) {
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
              value.html.length + (JSON.stringify(value.pageData)?.length || 0)
            )
          },
        })
      }
    } else {
      if (this.debug) {
        console.log('not using memory store for fetch cache')
      }
    }
  }

  public resetRequestCache(): void {
    memoryCache?.reset()
  }

  public async revalidateTag(tag: string) {
    if (this.debug) {
      console.log('revalidateTag', tag)
    }

    if (Date.now() < rateLimitedUntil) {
      if (this.debug) {
        console.log('rate limited ', rateLimitedUntil)
      }
      return
    }

    try {
      const res = await fetch(
        `${this.cacheEndpoint}/v1/suspense-cache/revalidate?tags=${tag}`,
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
      console.warn(`Failed to revalidate tag ${tag}`, err)
    }
  }

  public async get(...args: Parameters<CacheHandler['get']>) {
    const [key, ctx = {}] = args
    const { tags, softTags, kindHint, fetchIdx, fetchUrl } = ctx

    if (kindHint !== 'fetch') {
      return null
    }

    if (Date.now() < rateLimitedUntil) {
      if (this.debug) {
        console.log('rate limited')
      }
      return null
    }

    // memory cache is cleared at the end of each request
    // so that revalidate events are pulled from upstream
    // on successive requests
    let data = memoryCache?.get(key)

    // get data from fetch cache
    if (!data && this.cacheEndpoint) {
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
          if (this.debug) {
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

        const cached = await res.json()

        if (!cached || cached.kind !== 'FETCH') {
          this.debug && console.log({ cached })
          throw new Error(`invalid cache value`)
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

        if (this.debug) {
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
        if (this.debug) {
          console.error(`Failed to get from fetch-cache`, err)
        }
      }
    }

    return data || null
  }

  public async set(...args: Parameters<CacheHandler['set']>) {
    const [key, data, ctx] = args
    const { fetchCache, fetchIdx, fetchUrl, tags } = ctx
    if (!fetchCache) return

    if (Date.now() < rateLimitedUntil) {
      if (this.debug) {
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

        if (this.debug) {
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
          this.debug && console.log(await res.text())
          throw new Error(`invalid response ${res.status}`)
        }

        if (this.debug) {
          console.log(
            `successfully set to fetch-cache for ${key}, duration: ${
              Date.now() - start
            }ms, size: ${body.length}`
          )
        }
      } catch (err) {
        // unable to set to fetch-cache
        if (this.debug) {
          console.error(`Failed to update fetch cache`, err)
        }
      }
    }
    return
  }
}
