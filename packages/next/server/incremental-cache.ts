import { promises, readFileSync } from 'fs'
import LRUCache from 'next/dist/compiled/lru-cache'
import path from 'path'
import { PrerenderManifest } from '../build'
import { PRERENDER_MANIFEST } from '../shared/lib/constants'
import { normalizePagePath } from './normalize-page-path'

function toRoute(pathname: string): string {
  return pathname.replace(/\/$/, '').replace(/\/index$/, '') || '/'
}

interface CachedRedirectValue {
  kind: 'REDIRECT'
  props: Object
}

interface CachedPageValue {
  kind: 'PAGE'
  html: string
  pageData: Object
}

export type IncrementalCacheValue = CachedRedirectValue | CachedPageValue

type IncrementalCacheEntry = {
  curRevalidate?: number | false
  // milliseconds to revalidate after
  revalidateAfter: number | false
  isStale?: boolean
  value: IncrementalCacheValue | null
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

  constructor({
    max,
    dev,
    distDir,
    pagesDir,
    flushToDisk,
    locales,
  }: {
    dev: boolean
    max?: number
    distDir: string
    pagesDir: string
    flushToDisk?: boolean
    locales?: string[]
  }) {
    this.incrementalOptions = {
      dev,
      distDir,
      pagesDir,
      flushToDisk:
        !dev && (typeof flushToDisk !== 'undefined' ? flushToDisk : true),
    }
    this.locales = locales

    if (dev) {
      this.prerenderManifest = {
        version: -1 as any, // letting us know this doesn't conform to spec
        routes: {},
        dynamicRoutes: {},
        notFoundRoutes: [],
        preview: null as any, // `preview` is special case read in next-dev-server
      }
    } else {
      this.prerenderManifest = JSON.parse(
        readFileSync(path.join(distDir, PRERENDER_MANIFEST), 'utf8')
      )
    }

    if (process.env.__NEXT_TEST_MAX_ISR_CACHE) {
      // Allow cache size to be overridden for testing purposes
      max = parseInt(process.env.__NEXT_TEST_MAX_ISR_CACHE, 10)
    }

    if (max) {
      this.cache = new LRUCache({
        max,
        length({ value }) {
          if (!value || value.kind === 'REDIRECT') return 25
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
    return promises.readFile(this.getSeedPath(page, 'html'), 'utf8')
  }

  // get data from cache if available
  async get(pathname: string): Promise<IncrementalCacheEntry | null> {
    if (this.incrementalOptions.dev) return null
    pathname = normalizePagePath(pathname)

    let data = this.cache && this.cache.get(pathname)

    // let's check the disk for seed data
    if (!data) {
      if (this.prerenderManifest.notFoundRoutes.includes(pathname)) {
        return { revalidateAfter: false, value: null }
      }

      try {
        const htmlPath = this.getSeedPath(pathname, 'html')
        const html = await promises.readFile(htmlPath, 'utf8')
        const { mtime } = await promises.stat(htmlPath)
        const pageData = JSON.parse(
          await promises.readFile(this.getSeedPath(pathname, 'json'), 'utf8')
        )

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
        const seedPath = this.getSeedPath(pathname, 'html')
        await promises.mkdir(path.dirname(seedPath), { recursive: true })
        await promises.writeFile(seedPath, data.html, 'utf8')
        await promises.writeFile(
          this.getSeedPath(pathname, 'json'),
          JSON.stringify(data.pageData),
          'utf8'
        )
      } catch (error) {
        // failed to flush to disk
        console.warn('Failed to update prerender files for', pathname, error)
      }
    }
  }
}
