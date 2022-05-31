import type { CacheFs } from '../../../shared/lib/utils'

import FileSystemCache from './file-system-cache'
import { PrerenderManifest } from '../../../build'
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

    if (incrementalCacheHandlerPath) {
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
    pathname = toRoute(pathname)

    // in development we don't have a prerender-manifest
    // and default to always revalidating to allow easier debugging
    if (this.dev) return new Date().getTime() - 1000

    const { initialRevalidateSeconds } = this.prerenderManifest.routes[
      pathname
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
    if (this.dev) return null
    pathname = this._getPathname(pathname)
    const cacheData = await this.cacheHandler.get(pathname)

    if (cacheData) {
      const revalidateAfter = this.calculateRevalidate(
        pathname,
        cacheData.lastModified || Date.now()
      )
      return {
        revalidateAfter,
        value: cacheData.value,
        isStale:
          revalidateAfter !== false && revalidateAfter < Date.now()
            ? true
            : undefined,
        curRevalidate:
          this.prerenderManifest.routes[toRoute(pathname)]
            ?.initialRevalidateSeconds,
      }
    }

    if (
      !cacheData &&
      this.prerenderManifest.notFoundRoutes.includes(pathname)
    ) {
      return {
        value: null,
        revalidateAfter: this.calculateRevalidate(pathname, Date.now()),
      }
    }
    return null
  }

  // populate the incremental cache with new data
  async set(pathname: string, data: IncrementalCacheValue | null) {
    if (this.dev) return
    pathname = this._getPathname(pathname)

    try {
      await this.cacheHandler.set(pathname, data)
    } catch (error) {
      console.warn('Failed to update prerender cache for', pathname, error)
    }
  }
}
