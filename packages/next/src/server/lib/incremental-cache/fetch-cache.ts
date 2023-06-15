import LRUCache from 'next/dist/compiled/lru-cache'
import { FETCH_CACHE_HEADER } from '../../../client/components/app-router-headers'
import { CACHE_ONE_YEAR } from '../../../lib/constants'
import type { CacheHandler, CacheHandlerContext, CacheHandlerValue } from './'
import { getDerivedTags } from './utils'

let memoryCache: LRUCache<string, CacheHandlerValue> | undefined

interface NextFetchCacheParams {
  internal?: boolean
  fetchType?: string
  fetchIdx?: number
  fetchUrl?: string
}

export default class FetchCache implements CacheHandler {
  private headers: Record<string, string>
  private cacheEndpoint?: string
  private debug: boolean
  private revalidatedTags: string[]

  constructor(ctx: CacheHandlerContext) {
    this.debug = !!process.env.NEXT_PRIVATE_DEBUG_CACHE
    this.headers = {}
    this.revalidatedTags = ctx.revalidatedTags
    this.headers['Content-Type'] = 'application/json'

    if (FETCH_CACHE_HEADER in ctx._requestHeaders) {
      const newHeaders = JSON.parse(
        ctx._requestHeaders[FETCH_CACHE_HEADER] as string
      )
      for (const k in newHeaders) {
        this.headers[k] = newHeaders[k]
      }
      delete ctx._requestHeaders[FETCH_CACHE_HEADER]
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

  public async revalidateTag(tag: string) {
    if (this.debug) {
      console.log('revalidateTag', tag)
    }
    try {
      const res = await fetch(
        `${this.cacheEndpoint}/v1/suspense-cache/revalidate?tags=${tag}`,
        {
          method: 'POST',
          headers: this.headers,
          // @ts-expect-error
          next: { internal: true },
        }
      )

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}.`)
      }
    } catch (err) {
      console.warn(`Failed to revalidate tag ${tag}`, err)
    }
  }

  public async get(
    key: string,
    fetchCache?: boolean,
    fetchUrl?: string,
    fetchIdx?: number
  ) {
    if (!fetchCache) return null

    let data = memoryCache?.get(key)

    // memory cache data is only leveraged for up to 1 seconds
    // so that revalidation events can be pulled from source
    if (Date.now() - (data?.lastModified || 0) > 2000) {
      data = undefined
    }

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
              'X-Vercel-Cache-Item-Name': fetchUrl,
            } as any,
            next: fetchParams as NextFetchRequestConfig,
          }
        )

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

        const cacheState = res.headers.get('x-vercel-cache-state')
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
            }, cache-state: ${cacheState}`
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

    // if a tag was revalidated we don't return stale data
    if (data?.value?.kind === 'FETCH') {
      const innerData = data.value.data
      const derivedTags = getDerivedTags(innerData.tags || [])

      if (
        derivedTags.some((tag) => {
          return this.revalidatedTags.includes(tag)
        })
      ) {
        data = undefined
      }
    }

    return data || null
  }

  public async set(
    key: string,
    data: CacheHandlerValue['value'],
    fetchCache?: boolean,
    fetchUrl?: string,
    fetchIdx?: number
  ) {
    if (!fetchCache) return

    memoryCache?.set(key, {
      value: data,
      lastModified: Date.now(),
    })

    if (this.cacheEndpoint) {
      try {
        const start = Date.now()
        if (data !== null && 'revalidate' in data) {
          this.headers['x-vercel-revalidate'] = data.revalidate.toString()
        }
        if (
          !this.headers['x-vercel-revalidate'] &&
          data !== null &&
          'data' in data
        ) {
          this.headers['x-vercel-cache-control'] =
            data.data.headers['cache-control']
        }
        const body = JSON.stringify(data)
        const headers = { ...this.headers }
        if (data !== null && 'data' in data && data.data.tags) {
          headers['x-vercel-cache-tags'] = data.data.tags.join(',')
        }

        if (this.debug) {
          console.log('set cache', key, {
            tags: headers['x-vercel-cache-tags'],
          })
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
              ...headers,
              'X-Vercel-Cache-Item-Name': fetchUrl || '',
            },
            body: body,
            next: fetchParams as NextFetchRequestConfig,
          }
        )

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
