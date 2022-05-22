import type { CacheFs } from '../shared/lib/utils'

import LRUCache from 'next/dist/compiled/lru-cache'
import path from '../shared/lib/isomorphic/path'
import { PrerenderManifest } from '../build'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { IncrementalCacheValue, IncrementalCacheEntry } from './response-cache'

function toRoute(pathname: string): string {
  return pathname.replace(/\/$/, '').replace(/\/index$/, '') || '/'
}

export class IncrementalCache {
  incrementalOptions: {
    flushToDisk?: boolean
    pagesDir?: string
    distDir?: string
    dev?: boolean
  }

  prerenderManifest: PrerenderManifest
  cache?: LRUCache<string, IncrementalCacheEntry>
  locales?: string[]
  fs: CacheFs

  constructor({
    fs,
    max,
    dev,
    distDir,
    pagesDir,
    flushToDisk,
    locales,
    getPrerenderManifest,
  }: {
    fs: CacheFs
    dev: boolean
    max?: number
    distDir: string
    pagesDir: string
    flushToDisk?: boolean
    locales?: string[]
    getPrerenderManifest: () => PrerenderManifest
  }) {
    this.fs = fs
    this.incrementalOptions = {
      dev,
      distDir,
      pagesDir,
      flushToDisk:
        !dev && (typeof flushToDisk !== 'undefined' ? flushToDisk : true),
    }
    this.locales = locales
    this.prerenderManifest = getPrerenderManifest()

    if (process.env.__NEXT_TEST_MAX_ISR_CACHE) {
      // Allow cache size to be overridden for testing purposes
      max = parseInt(process.env.__NEXT_TEST_MAX_ISR_CACHE, 10)
    }

    if (max) {
      this.cache = new LRUCache({
        max,
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

  private getSeedPath(pathname: string, ext: string): string {
    return path.join(this.incrementalOptions.pagesDir!, `${pathname}.${ext}`)
  }

  private calculateRevalidate(
    pathname: string,
    fromTime: number
  ): number | false {
    pathname = toRoute(pathname)

    // in development we don't have a prerender-manifest
    // and default to always revalidating to allow easier debugging
    if (this.incrementalOptions.dev) return new Date().getTime() - 1000

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

  getFallback(page: string): Promise<string> {
    page = normalizePagePath(page)
    return this.fs.readFile(this.getSeedPath(page, 'html'))
  }

  // get data from cache if available
  async get(pathname: string): Promise<IncrementalCacheEntry | null> {
    if (this.incrementalOptions.dev) return null
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
        const htmlPath = this.getSeedPath(pathname, 'html')
        const jsonPath = this.getSeedPath(pathname, 'json')
        const html = await this.fs.readFile(htmlPath)
        const pageData = JSON.parse(await this.fs.readFile(jsonPath))
        const { mtime } = await this.fs.stat(htmlPath)

        data = {
          revalidateAfter: this.calculateRevalidate(pathname, mtime.getTime()),
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
    if (this.incrementalOptions.dev) return
    if (typeof revalidateSeconds !== 'undefined') {
      // TODO: Update this to not mutate the manifest from the
      // build.
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

    // TODO: This option needs to cease to exist unless it stops mutating the
    // `next build` output's manifest.
    if (this.incrementalOptions.flushToDisk && data?.kind === 'PAGE') {
      try {
        const seedHtmlPath = this.getSeedPath(pathname, 'html')
        const seedJsonPath = this.getSeedPath(pathname, 'json')
        await this.fs.mkdir(path.dirname(seedHtmlPath))
        await this.fs.writeFile(seedHtmlPath, data.html)
        await this.fs.writeFile(seedJsonPath, JSON.stringify(data.pageData))
      } catch (error) {
        // failed to flush to disk
        console.warn('Failed to update prerender files for', pathname, error)
      }
    }
  }
}
