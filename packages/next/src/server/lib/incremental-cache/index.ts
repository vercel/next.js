import type { CacheFs } from '../../../shared/lib/utils'
import FileSystemCache from './file-system-cache'
import { PrerenderManifest } from '../../../build'
import path from '../../../shared/lib/isomorphic/path'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import FetchCache from './fetch-cache'
import {
  IncrementalCacheValue,
  IncrementalCacheEntry,
} from '../../response-cache'
import { encode } from '../../../shared/lib/bloom-filter/base64-arraybuffer'
import { encodeText } from '../../stream-utils/encode-decode'
import {
  CACHE_ONE_YEAR,
  PRERENDER_REVALIDATE_HEADER,
} from '../../../lib/constants'

function toRoute(pathname: string): string {
  return pathname.replace(/\/$/, '').replace(/\/index$/, '') || '/'
}

export interface CacheHandlerContext {
  fs?: CacheFs
  dev?: boolean
  flushToDisk?: boolean
  serverDistDir?: string
  maxMemoryCacheSize?: number
  fetchCacheKeyPrefix?: string
  prerenderManifest?: PrerenderManifest
  revalidatedTags: string[]
  _appDir: boolean
  _requestHeaders: IncrementalCache['requestHeaders']
}

export interface CacheHandlerValue {
  lastModified?: number
  age?: number
  cacheState?: string
  value: IncrementalCacheValue | null
}

export class CacheHandler {
  // eslint-disable-next-line
  constructor(_ctx: CacheHandlerContext) {}

  public async get(
    _key: string,
    _fetchCache?: boolean,
    _fetchUrl?: string,
    _fetchIdx?: number
  ): Promise<CacheHandlerValue | null> {
    return {} as any
  }

  public async set(
    _key: string,
    _data: IncrementalCacheValue | null,
    _fetchCache?: boolean,
    _fetchUrl?: string,
    _fetchIdx?: number
  ): Promise<void> {}

  public async revalidateTag(_tag: string): Promise<void> {}
}

export class IncrementalCache {
  dev?: boolean
  cacheHandler?: CacheHandler
  prerenderManifest: PrerenderManifest
  requestHeaders: Record<string, undefined | string | string[]>
  requestProtocol?: 'http' | 'https'
  allowedRevalidateHeaderKeys?: string[]
  minimalMode?: boolean
  fetchCacheKeyPrefix?: string
  revalidatedTags?: string[]
  isOnDemandRevalidate?: boolean

  constructor({
    fs,
    dev,
    appDir,
    flushToDisk,
    fetchCache,
    minimalMode,
    serverDistDir,
    requestHeaders,
    requestProtocol,
    maxMemoryCacheSize,
    getPrerenderManifest,
    fetchCacheKeyPrefix,
    CurCacheHandler,
    allowedRevalidateHeaderKeys,
  }: {
    fs?: CacheFs
    dev: boolean
    appDir?: boolean
    fetchCache?: boolean
    minimalMode?: boolean
    serverDistDir?: string
    flushToDisk?: boolean
    requestProtocol?: 'http' | 'https'
    allowedRevalidateHeaderKeys?: string[]
    requestHeaders: IncrementalCache['requestHeaders']
    maxMemoryCacheSize?: number
    getPrerenderManifest: () => PrerenderManifest
    fetchCacheKeyPrefix?: string
    CurCacheHandler?: typeof CacheHandler
  }) {
    const debug = !!process.env.NEXT_PRIVATE_DEBUG_CACHE
    if (!CurCacheHandler) {
      if (fs && serverDistDir) {
        if (debug) {
          console.log('using filesystem cache handler')
        }
        CurCacheHandler = FileSystemCache
      }
      if (minimalMode && fetchCache) {
        if (debug) {
          console.log('using fetch cache handler')
        }
        CurCacheHandler = FetchCache
      }
    } else if (debug) {
      console.log('using custom cache handler', CurCacheHandler.name)
    }

    if (process.env.__NEXT_TEST_MAX_ISR_CACHE) {
      // Allow cache size to be overridden for testing purposes
      maxMemoryCacheSize = parseInt(process.env.__NEXT_TEST_MAX_ISR_CACHE, 10)
    }
    this.dev = dev
    this.minimalMode = minimalMode
    this.requestHeaders = requestHeaders
    this.requestProtocol = requestProtocol
    this.allowedRevalidateHeaderKeys = allowedRevalidateHeaderKeys
    this.prerenderManifest = getPrerenderManifest()
    this.fetchCacheKeyPrefix = fetchCacheKeyPrefix
    let revalidatedTags: string[] = []

    if (
      requestHeaders[PRERENDER_REVALIDATE_HEADER] ===
      this.prerenderManifest?.preview?.previewModeId
    ) {
      this.isOnDemandRevalidate = true
    }

    if (
      minimalMode &&
      typeof requestHeaders['x-next-revalidated-tags'] === 'string' &&
      requestHeaders['x-next-revalidats-tag-token'] ===
        this.prerenderManifest?.preview?.previewModeId
    ) {
      revalidatedTags = requestHeaders['x-next-revalidated-tags'].split(',')
    }

    if (CurCacheHandler) {
      this.cacheHandler = new CurCacheHandler({
        dev,
        fs,
        flushToDisk,
        serverDistDir,
        revalidatedTags,
        maxMemoryCacheSize,
        _appDir: !!appDir,
        _requestHeaders: requestHeaders,
        fetchCacheKeyPrefix,
      })
    }
  }

  private calculateRevalidate(
    pathname: string,
    fromTime: number,
    dev?: boolean
  ): number | false {
    // in development we don't have a prerender-manifest
    // and default to always revalidating to allow easier debugging
    if (dev) return new Date().getTime() - 1000

    // if an entry isn't present in routes we fallback to a default
    // of revalidating after 1 second
    const { initialRevalidateSeconds } = this.prerenderManifest.routes[
      toRoute(pathname)
    ] || {
      initialRevalidateSeconds: 1,
    }
    const revalidateAfter =
      typeof initialRevalidateSeconds === 'number'
        ? initialRevalidateSeconds * 1000 + fromTime
        : initialRevalidateSeconds

    return revalidateAfter
  }

  _getPathname(pathname: string, fetchCache?: boolean) {
    return fetchCache ? pathname : normalizePagePath(pathname)
  }

  async revalidateTag(tag: string) {
    return this.cacheHandler?.revalidateTag?.(tag)
  }

  // x-ref: https://github.com/facebook/react/blob/2655c9354d8e1c54ba888444220f63e836925caa/packages/react/src/ReactFetch.js#L23
  async fetchCacheKey(
    url: string,
    init: RequestInit | Request = {}
  ): Promise<string> {
    // this should be bumped anytime a fix is made to cache entries
    // that should bust the cache
    const MAIN_KEY_PREFIX = 'v3'

    let cacheKey: string
    const bodyChunks: string[] = []

    if (init.body) {
      // handle ReadableStream body
      if (typeof (init.body as any).getReader === 'function') {
        const readableBody = init.body as ReadableStream
        const reader = readableBody.getReader()
        let arrayBuffer = new Uint8Array()

        function processValue({
          done,
          value,
        }: {
          done?: boolean
          value?: ArrayBuffer | string
        }): any {
          if (done) {
            return
          }
          if (value) {
            try {
              bodyChunks.push(typeof value === 'string' ? value : encode(value))
              const curBuffer: Uint8Array =
                typeof value === 'string'
                  ? encodeText(value)
                  : new Uint8Array(value)

              const prevBuffer = arrayBuffer
              arrayBuffer = new Uint8Array(
                prevBuffer.byteLength + curBuffer.byteLength
              )
              arrayBuffer.set(prevBuffer)
              arrayBuffer.set(curBuffer, prevBuffer.byteLength)
            } catch (err) {
              console.error(err)
            }
          }
          reader.read().then(processValue)
        }
        await reader.read().then(processValue)
        ;(init as any)._ogBody = arrayBuffer
      } // handle FormData or URLSearchParams bodies
      else if (typeof (init.body as any).keys === 'function') {
        const formData = init.body as FormData
        ;(init as any)._ogBody = init.body
        for (const key of new Set([...formData.keys()])) {
          const values = formData.getAll(key)
          bodyChunks.push(
            `${key}=${(
              await Promise.all(
                values.map(async (val) => {
                  if (typeof val === 'string') {
                    return val
                  } else {
                    return await val.text()
                  }
                })
              )
            ).join(',')}`
          )
        }
        // handle blob body
      } else if (typeof (init.body as any).arrayBuffer === 'function') {
        const blob = init.body as Blob
        const arrayBuffer = await blob.arrayBuffer()
        bodyChunks.push(encode(await (init.body as Blob).arrayBuffer()))
        ;(init as any)._ogBody = new Blob([arrayBuffer], { type: blob.type })
      } else if (typeof init.body === 'string') {
        bodyChunks.push(init.body)
        ;(init as any)._ogBody = init.body
      }
    }

    const cacheString = JSON.stringify([
      MAIN_KEY_PREFIX,
      this.fetchCacheKeyPrefix || '',
      url,
      init.method,
      init.headers,
      init.mode,
      init.redirect,
      init.credentials,
      init.referrer,
      init.referrerPolicy,
      init.integrity,
      init.cache,
      bodyChunks,
    ])

    if (process.env.NEXT_RUNTIME === 'edge') {
      function bufferToHex(buffer: ArrayBuffer): string {
        return Array.prototype.map
          .call(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0'))
          .join('')
      }
      const buffer = encodeText(cacheString)
      cacheKey = bufferToHex(await crypto.subtle.digest('SHA-256', buffer))
    } else {
      const crypto = require('crypto') as typeof import('crypto')
      cacheKey = crypto.createHash('sha256').update(cacheString).digest('hex')
    }
    return cacheKey
  }

  // get data from cache if available
  async get(
    pathname: string,
    fetchCache?: boolean,
    revalidate?: number | false,
    fetchUrl?: string,
    fetchIdx?: number
  ): Promise<IncrementalCacheEntry | null> {
    // we don't leverage the prerender cache in dev mode
    // so that getStaticProps is always called for easier debugging
    if (
      this.dev &&
      (!fetchCache || this.requestHeaders['cache-control'] === 'no-cache')
    ) {
      return null
    }

    pathname = this._getPathname(pathname, fetchCache)
    let entry: IncrementalCacheEntry | null = null
    const cacheData = await this.cacheHandler?.get(
      pathname,
      fetchCache,
      fetchUrl,
      fetchIdx
    )

    if (cacheData?.value?.kind === 'FETCH') {
      revalidate = revalidate || cacheData.value.revalidate
      const age = Math.round(
        (Date.now() - (cacheData.lastModified || 0)) / 1000
      )

      const isStale = age > revalidate
      const data = cacheData.value.data

      return {
        isStale: isStale,
        value: {
          kind: 'FETCH',
          data,
          revalidate: revalidate,
        },
        revalidateAfter: Date.now() + revalidate * 1000,
      }
    }

    const curRevalidate =
      this.prerenderManifest.routes[toRoute(pathname)]?.initialRevalidateSeconds

    let isStale: boolean | -1 | undefined
    let revalidateAfter: false | number

    if (cacheData?.lastModified === -1) {
      isStale = -1
      revalidateAfter = -1 * CACHE_ONE_YEAR
    } else {
      revalidateAfter = this.calculateRevalidate(
        pathname,
        cacheData?.lastModified || Date.now(),
        this.dev && !fetchCache
      )
      isStale =
        revalidateAfter !== false && revalidateAfter < Date.now()
          ? true
          : undefined
    }

    if (cacheData) {
      entry = {
        isStale,
        curRevalidate,
        revalidateAfter,
        value: cacheData.value,
      }
    }

    if (
      !cacheData &&
      this.prerenderManifest.notFoundRoutes.includes(pathname)
    ) {
      // for the first hit after starting the server the cache
      // may not have a way to save notFound: true so if
      // the prerender-manifest marks this as notFound then we
      // return that entry and trigger a cache set to give it a
      // chance to update in-memory entries
      entry = {
        isStale,
        value: null,
        curRevalidate,
        revalidateAfter,
      }
      this.set(
        pathname,
        entry.value,
        curRevalidate,
        fetchCache,
        fetchUrl,
        fetchIdx
      )
    }
    return entry
  }

  // populate the incremental cache with new data
  async set(
    pathname: string,
    data: IncrementalCacheValue | null,
    revalidateSeconds?: number | false,
    fetchCache?: boolean,
    fetchUrl?: string,
    fetchIdx?: number
  ) {
    if (this.dev && !fetchCache) return
    // fetchCache has upper limit of 2MB per-entry currently
    if (fetchCache && JSON.stringify(data).length > 2 * 1024 * 1024) {
      if (this.dev) {
        throw new Error(`fetch for over 2MB of data can not be cached`)
      }
      return
    }

    pathname = this._getPathname(pathname, fetchCache)

    try {
      // we use the prerender manifest memory instance
      // to store revalidate timings for calculating
      // revalidateAfter values so we update this on set
      if (typeof revalidateSeconds !== 'undefined' && !fetchCache) {
        this.prerenderManifest.routes[pathname] = {
          dataRoute: path.posix.join(
            '/_next/data',
            `${normalizePagePath(pathname)}.json`
          ),
          srcRoute: null, // FIXME: provide actual source route, however, when dynamically appending it doesn't really matter
          initialRevalidateSeconds: revalidateSeconds,
        }
      }
      await this.cacheHandler?.set(
        pathname,
        data,
        fetchCache,
        fetchUrl,
        fetchIdx
      )
    } catch (error) {
      console.warn('Failed to update prerender cache for', pathname, error)
    }
  }
}
