import type { CacheFs } from '../../../shared/lib/utils'
import FileSystemCache from './file-system-cache'
import { PrerenderManifest } from '../../../build'
import path from '../../../shared/lib/isomorphic/path'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
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
}

export interface CacheHandlerValue {
  lastModified?: number
  value: IncrementalCacheValue | null
}

export class CacheHandler {
  // eslint-disable-next-line
  constructor(_ctx: CacheHandlerContext) {}

  public async get(_key: string): Promise<CacheHandlerValue | null> {
    return {} as any
  }

  public async set(
    _key: string,
    _data: IncrementalCacheValue | null
  ): Promise<void> {}
}

export class IncrementalCache {
  dev?: boolean
  cacheHandler: CacheHandler
  prerenderManifest: PrerenderManifest

  constructor({
    fs,
    dev,
    flushToDisk,
    serverDistDir,
    maxMemoryCacheSize,
    getPrerenderManifest,
    incrementalCacheHandlerPath,
  }: {
    fs: CacheFs
    dev: boolean
    serverDistDir: string
    flushToDisk?: boolean
    maxMemoryCacheSize?: number
    incrementalCacheHandlerPath?: string
    getPrerenderManifest: () => PrerenderManifest
  }) {
    let cacheHandlerMod: any = FileSystemCache

    if (process.env.NEXT_RUNTIME !== 'edge' && incrementalCacheHandlerPath) {
      cacheHandlerMod = require(incrementalCacheHandlerPath)
      cacheHandlerMod = cacheHandlerMod.default || cacheHandlerMod
    }

    if (process.env.__NEXT_TEST_MAX_ISR_CACHE) {
      // Allow cache size to be overridden for testing purposes
      maxMemoryCacheSize = parseInt(process.env.__NEXT_TEST_MAX_ISR_CACHE, 10)
    }
    this.dev = dev
    this.prerenderManifest = getPrerenderManifest()
    this.cacheHandler = new (cacheHandlerMod as typeof CacheHandler)({
      dev,
      fs,
      flushToDisk,
      serverDistDir,
      maxMemoryCacheSize,
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

  _getPathname(pathname: string) {
    return normalizePagePath(pathname)
  }

  // get data from cache if available
  async get(pathname: string): Promise<IncrementalCacheEntry | null> {
    // we don't leverage the prerender cache in dev mode
    // so that getStaticProps is always called for easier debugging
    if (this.dev) return null

    pathname = this._getPathname(pathname)
    let entry: IncrementalCacheEntry | null = null
    const cacheData = await this.cacheHandler.get(pathname)

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
      this.set(pathname, entry.value, curRevalidate)
    }
    return entry
  }

  // populate the incremental cache with new data
  async set(
    pathname: string,
    data: IncrementalCacheValue | null,
    revalidateSeconds?: number | false
  ) {
    if (this.dev) return
    pathname = this._getPathname(pathname)

    try {
      // we use the prerender manifest memory instance
      // to store revalidate timings for calculating
      // revalidateAfter values so we update this on set
      if (typeof revalidateSeconds !== 'undefined') {
        this.prerenderManifest.routes[pathname] = {
          dataRoute: path.posix.join(
            '/_next/data',
            `${normalizePagePath(pathname)}.json`
          ),
          srcRoute: null, // FIXME: provide actual source route, however, when dynamically appending it doesn't really matter
          initialRevalidateSeconds: revalidateSeconds,
        }
      }
      await this.cacheHandler.set(pathname, data)
    } catch (error) {
      console.warn('Failed to update prerender cache for', pathname, error)
    }
  }
}
