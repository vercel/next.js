import type { CacheFs } from '../../../shared/lib/utils'

import LRUCache from 'next/dist/compiled/lru-cache'
import path from '../../../shared/lib/isomorphic/path'
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
  flushToDisk?: boolean
  pagesDir: string
  distDir: string
  dev?: boolean
  fs: CacheFs
}

export class CacheHandler {
  // eslint-disable-next-line
  constructor(_ctx: CacheHandlerContext) {}

  public async get(_key: string): Promise<string> {
    return ''
  }
  public async getMeta(_key: string): Promise<{
    // time in epoch e.g. Date.now()
    mtime: number
  }> {
    return {} as any
  }
  public async set(_key: string, _data: string): Promise<void> {}
}

export class IncrementalCache {
  prerenderManifest: PrerenderManifest
  cache?: LRUCache<string, IncrementalCacheEntry>
  dev?: boolean
  cacheHandler: CacheHandler

  constructor({
    fs,
    dev,
    distDir,
    pagesDir,
    flushToDisk,
    maxMemoryCacheSize,
    getPrerenderManifest,
    incrementalCacheHandlerPath,
  }: {
    fs: CacheFs
    dev: boolean
    distDir: string
    pagesDir: string
    flushToDisk?: boolean
    maxMemoryCacheSize?: number
    incrementalCacheHandlerPath?: string
    getPrerenderManifest: () => PrerenderManifest
  }) {
    if (!incrementalCacheHandlerPath) {
      incrementalCacheHandlerPath = require.resolve('./file-system-cache')
    }
    const cacheHandlerMod = require(incrementalCacheHandlerPath)
    this.cacheHandler = new ((cacheHandlerMod.default ||
      cacheHandlerMod) as typeof CacheHandler)({
      dev,
      distDir,
      fs,
      pagesDir,
      flushToDisk,
    })

    this.dev = dev
    this.prerenderManifest = getPrerenderManifest()

    if (process.env.__NEXT_TEST_MAX_ISR_CACHE) {
      // Allow cache size to be overridden for testing purposes
      maxMemoryCacheSize = parseInt(process.env.__NEXT_TEST_MAX_ISR_CACHE, 10)
    }

    if (maxMemoryCacheSize) {
      this.cache = new LRUCache({
        max: maxMemoryCacheSize,
        length({ value }) {
          if (!value) {
            return 25
          } else if (value.kind === 'REDIRECT') {
            return JSON.stringify(value.props).length
          } else if (value.kind === 'IMAGE') {
            throw new Error('invariant image should not be incremental-cache')
          }
          // rough estimate of size of cache value
          return value.html.length + JSON.stringify(value.pageData).length
        },
      })
    }
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

  // get data from cache if available
  async get(pathname: string): Promise<IncrementalCacheEntry | null> {
    if (this.dev) return null
    pathname = normalizePagePath(pathname)

    let data = this.cache && this.cache.get(pathname)

    // let's check the disk for seed data
    if (!data) {
      if (this.prerenderManifest.notFoundRoutes.includes(pathname)) {
        const now = Date.now()
        const revalidateAfter = this.calculateRevalidate(pathname, now)
        data = {
          value: null,
          revalidateAfter: revalidateAfter !== false ? now : false,
        }
      }

      try {
        const htmlPath = `${pathname}.html`
        const html = await this.cacheHandler.get(htmlPath)
        const pageData = JSON.parse(
          await this.cacheHandler.get(`${pathname}.json`)
        )
        const { mtime } = await this.cacheHandler.getMeta(htmlPath)

        data = {
          revalidateAfter: this.calculateRevalidate(pathname, mtime),
          value: {
            kind: 'PAGE',
            html,
            pageData,
          },
        }
        if (this.cache) {
          this.cache.set(pathname, data)
        }
      } catch (_) {
        // unable to get data from disk
      }
    }
    if (!data) {
      return null
    }

    if (
      data &&
      data.revalidateAfter !== false &&
      data.revalidateAfter < new Date().getTime()
    ) {
      data.isStale = true
    }

    const manifestPath = toRoute(pathname)
    const manifestEntry = this.prerenderManifest.routes[manifestPath]

    if (data && manifestEntry) {
      data.curRevalidate = manifestEntry.initialRevalidateSeconds
    }
    return data
  }

  // populate the incremental cache with new data
  async set(
    pathname: string,
    data: IncrementalCacheValue | null,
    revalidateSeconds?: number | false
  ) {
    if (this.dev) return
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

    pathname = normalizePagePath(pathname)
    if (this.cache) {
      this.cache.set(pathname, {
        revalidateAfter: this.calculateRevalidate(
          pathname,
          new Date().getTime()
        ),
        value: data,
      })
    }

    if (data?.kind === 'PAGE') {
      try {
        await this.cacheHandler.set(`${pathname}.html`, data.html)
        await this.cacheHandler.set(
          `${pathname}.json`,
          JSON.stringify(data.pageData)
        )
      } catch (error) {
        // failed to set to cache handler
        console.warn('Failed to update prerender files for', pathname, error)
      }
    }
  }
}
