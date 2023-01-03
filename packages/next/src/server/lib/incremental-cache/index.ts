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

function toRoute(pathname: string): string {
  return pathname.replace(/\/$/, '').replace(/\/index$/, '') || '/'
}

export interface CacheHandlerContext {
  fs: CacheFs
  dev?: boolean
  flushToDisk?: boolean
  serverDistDir: string
  maxMemoryCacheSize?: number
  _appDir: boolean
  _requestHeaders: IncrementalCache['requestHeaders']
}

export interface CacheHandlerValue {
  lastModified?: number
  value: IncrementalCacheValue | null
}

export class CacheHandler {
  // eslint-disable-next-line
  constructor(_ctx: CacheHandlerContext) {}

  public async get(
    _key: string,
    _fetchCache?: boolean
  ): Promise<CacheHandlerValue | null> {
    return {} as any
  }

  public async set(
    _key: string,
    _data: IncrementalCacheValue | null,
    _fetchCache?: boolean
  ): Promise<void> {}
}

export class IncrementalCache {
  dev?: boolean
  cacheHandler: CacheHandler
  prerenderManifest: PrerenderManifest
  requestHeaders: Record<string, undefined | string | string[]>
  minimalMode?: boolean

  constructor({
    fs,
    dev,
    appDir,
    flushToDisk,
    fetchCache,
    minimalMode,
    serverDistDir,
    requestHeaders,
    maxMemoryCacheSize,
    getPrerenderManifest,
    incrementalCacheHandlerPath,
  }: {
    fs: CacheFs
    dev: boolean
    appDir?: boolean
    fetchCache?: boolean
    minimalMode?: boolean
    serverDistDir: string
    flushToDisk?: boolean
    requestHeaders: IncrementalCache['requestHeaders']
    maxMemoryCacheSize?: number
    incrementalCacheHandlerPath?: string
    getPrerenderManifest: () => PrerenderManifest
  }) {
    let cacheHandlerMod: any = FileSystemCache

    if (process.env.NEXT_RUNTIME !== 'edge' && incrementalCacheHandlerPath) {
      cacheHandlerMod = require(incrementalCacheHandlerPath)
      cacheHandlerMod = cacheHandlerMod.default || cacheHandlerMod
    }

    if (minimalMode && fetchCache) {
      cacheHandlerMod = FetchCache
    }

    if (process.env.__NEXT_TEST_MAX_ISR_CACHE) {
      // Allow cache size to be overridden for testing purposes
      maxMemoryCacheSize = parseInt(process.env.__NEXT_TEST_MAX_ISR_CACHE, 10)
    }
    this.dev = dev
    this.minimalMode = minimalMode
    this.requestHeaders = requestHeaders
    this.prerenderManifest = getPrerenderManifest()
    this.cacheHandler = new (cacheHandlerMod as typeof CacheHandler)({
      dev,
      fs,
      flushToDisk,
      serverDistDir,
      maxMemoryCacheSize,
      _appDir: !!appDir,
      _requestHeaders: requestHeaders,
    })
  }

  private calculateRevalidate(
    pathname: string,
    fromTime: number
  ): number | false {
    // in development we don't have a prerender-manifest
    // and default to always revalidating to allow easier debugging
    if (this.dev) return new Date().getTime() - 1000

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

  // x-ref: https://github.com/facebook/react/blob/2655c9354d8e1c54ba888444220f63e836925caa/packages/react/src/ReactFetch.js#L23
  async fetchCacheKey(url: string, init: RequestInit = {}): Promise<string> {
    const cacheString = JSON.stringify([
      url,
      init.method,
      init.headers,
      init.mode,
      init.redirect,
      init.credentials,
      init.referrer,
      init.referrerPolicy,
      init.integrity,
      init.next,
      init.cache,
    ])
    let cacheKey: string

    if (process.env.NEXT_RUNTIME === 'edge') {
      function bufferToHex(buffer: ArrayBuffer): string {
        return Array.prototype.map
          .call(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0'))
          .join('')
      }
      const buffer = new TextEncoder().encode(cacheString)
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
    fetchCache?: boolean
  ): Promise<IncrementalCacheEntry | null> {
    // we don't leverage the prerender cache in dev mode
    // so that getStaticProps is always called for easier debugging
    if (this.dev) return null

    pathname = this._getPathname(pathname, fetchCache)
    let entry: IncrementalCacheEntry | null = null
    const cacheData = await this.cacheHandler.get(pathname, fetchCache)

    if (cacheData?.value?.kind === 'FETCH') {
      const data = cacheData.value.data
      const age = Math.round(
        (Date.now() - (cacheData.lastModified || 0)) / 1000
      )
      const revalidate = cacheData.value.revalidate

      return {
        isStale: age > revalidate,
        value: {
          kind: 'FETCH',
          data,
          age,
          revalidate,
          isStale: age > revalidate,
        },
        revalidateAfter:
          (cacheData.lastModified || Date.now()) + revalidate * 1000,
      }
    }

    const curRevalidate =
      this.prerenderManifest.routes[toRoute(pathname)]?.initialRevalidateSeconds
    const revalidateAfter = this.calculateRevalidate(
      pathname,
      cacheData?.lastModified || Date.now()
    )
    const isStale =
      revalidateAfter !== false && revalidateAfter < Date.now()
        ? true
        : undefined

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
      this.set(pathname, entry.value, curRevalidate, fetchCache)
    }
    return entry
  }

  // populate the incremental cache with new data
  async set(
    pathname: string,
    data: IncrementalCacheValue | null,
    revalidateSeconds?: number | false,
    fetchCache?: boolean
  ) {
    if (this.dev) return
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
      await this.cacheHandler.set(pathname, data, fetchCache)
    } catch (error) {
      console.warn('Failed to update prerender cache for', pathname, error)
    }
  }
}
