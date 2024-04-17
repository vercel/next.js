import type { RouteMetadata } from '../../../export/routes/types'
import type { CacheHandler, CacheHandlerContext, CacheHandlerValue } from './'
import type { CacheFs } from '../../../shared/lib/utils'
import type { CachedFetchValue } from '../../response-cache'

import LRUCache from 'next/dist/compiled/lru-cache'
import path from '../../../shared/lib/isomorphic/path'
import {
  NEXT_CACHE_TAGS_HEADER,
  NEXT_DATA_SUFFIX,
  NEXT_META_SUFFIX,
  RSC_PREFETCH_SUFFIX,
  RSC_SUFFIX,
} from '../../../lib/constants'

type FileSystemCacheContext = Omit<
  CacheHandlerContext,
  'fs' | 'serverDistDir'
> & {
  fs: CacheFs
  serverDistDir: string
  experimental: { ppr: boolean }
}

type TagsManifest = {
  version: 1
  items: { [tag: string]: { revalidatedAt: number } }
}
let memoryCache: LRUCache<string, CacheHandlerValue> | undefined
let tagsManifest: TagsManifest | undefined

export default class FileSystemCache implements CacheHandler {
  private fs: FileSystemCacheContext['fs']
  private flushToDisk?: FileSystemCacheContext['flushToDisk']
  private serverDistDir: FileSystemCacheContext['serverDistDir']
  private appDir: boolean
  private pagesDir: boolean
  private tagsManifestPath?: string
  private revalidatedTags: string[]
  private readonly experimental: { ppr: boolean }
  private debug: boolean

  constructor(ctx: FileSystemCacheContext) {
    this.fs = ctx.fs
    this.flushToDisk = ctx.flushToDisk
    this.serverDistDir = ctx.serverDistDir
    this.appDir = !!ctx._appDir
    this.pagesDir = !!ctx._pagesDir
    this.revalidatedTags = ctx.revalidatedTags
    this.experimental = ctx.experimental
    this.debug = !!process.env.NEXT_PRIVATE_DEBUG_CACHE

    if (ctx.maxMemoryCacheSize && !memoryCache) {
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
    } else if (this.debug) {
      console.log('not using memory store for fetch cache')
    }

    if (this.serverDistDir && this.fs) {
      this.tagsManifestPath = path.join(
        this.serverDistDir,
        '..',
        'cache',
        'fetch-cache',
        'tags-manifest.json'
      )
      this.loadTagsManifest()
    }
  }

  public resetRequestCache(): void {}

  private loadTagsManifest() {
    if (!this.tagsManifestPath || !this.fs || tagsManifest) return
    try {
      tagsManifest = JSON.parse(
        this.fs.readFileSync(this.tagsManifestPath, 'utf8')
      )
    } catch (err: any) {
      tagsManifest = { version: 1, items: {} }
    }
    if (this.debug) console.log('loadTagsManifest', tagsManifest)
  }

  public async revalidateTag(tag: string) {
    if (this.debug) {
      console.log('revalidateTag', tag)
    }

    // we need to ensure the tagsManifest is refreshed
    // since separate workers can be updating it at the same
    // time and we can't flush out of sync data
    this.loadTagsManifest()
    if (!tagsManifest || !this.tagsManifestPath) {
      return
    }

    const data = tagsManifest.items[tag] || {}
    data.revalidatedAt = Date.now()
    tagsManifest.items[tag] = data

    try {
      await this.fs.mkdir(path.dirname(this.tagsManifestPath))
      await this.fs.writeFile(
        this.tagsManifestPath,
        JSON.stringify(tagsManifest || {})
      )
      if (this.debug) {
        console.log('Updated tags manifest', tagsManifest)
      }
    } catch (err: any) {
      console.warn('Failed to update tags manifest.', err)
    }
  }

  public async get(...args: Parameters<CacheHandler['get']>) {
    const [key, ctx = {}] = args
    const { tags, softTags, kindHint } = ctx
    let data = memoryCache?.get(key)

    if (this.debug) {
      console.log('get', key, tags, kindHint, !!data)
    }

    // let's check the disk for seed data
    if (!data && process.env.NEXT_RUNTIME !== 'edge') {
      try {
        const filePath = this.getFilePath(`${key}.body`, 'app')
        const fileData = await this.fs.readFile(filePath)
        const { mtime } = await this.fs.stat(filePath)

        const meta = JSON.parse(
          await this.fs.readFile(
            filePath.replace(/\.body$/, NEXT_META_SUFFIX),
            'utf8'
          )
        )

        const cacheEntry: CacheHandlerValue = {
          lastModified: mtime.getTime(),
          value: {
            kind: 'ROUTE',
            body: fileData,
            headers: meta.headers,
            status: meta.status,
          },
        }
        return cacheEntry
      } catch (_) {
        // no .meta data for the related key
      }

      try {
        // Determine the file kind if we didn't know it already.
        let kind = kindHint
        if (!kind) {
          kind = this.detectFileKind(`${key}.html`)
        }

        const isAppPath = kind === 'app'
        const filePath = this.getFilePath(
          kind === 'fetch' ? key : `${key}.html`,
          kind
        )

        const fileData = await this.fs.readFile(filePath, 'utf8')
        const { mtime } = await this.fs.stat(filePath)

        if (kind === 'fetch' && this.flushToDisk) {
          const lastModified = mtime.getTime()
          const parsedData: CachedFetchValue = JSON.parse(fileData)
          data = {
            lastModified,
            value: parsedData,
          }

          if (data.value?.kind === 'FETCH') {
            const storedTags = data.value?.tags

            // update stored tags if a new one is being added
            // TODO: remove this when we can send the tags
            // via header on GET same as SET
            if (!tags?.every((tag) => storedTags?.includes(tag))) {
              if (this.debug) {
                console.log('tags vs storedTags mismatch', tags, storedTags)
              }
              await this.set(key, data.value, { tags })
            }
          }
        } else {
          const pageData = isAppPath
            ? await this.fs.readFile(
                this.getFilePath(
                  `${key}${
                    this.experimental.ppr ? RSC_PREFETCH_SUFFIX : RSC_SUFFIX
                  }`,
                  'app'
                ),
                'utf8'
              )
            : JSON.parse(
                await this.fs.readFile(
                  this.getFilePath(`${key}${NEXT_DATA_SUFFIX}`, 'pages'),
                  'utf8'
                )
              )

          let meta: RouteMetadata | undefined

          if (isAppPath) {
            try {
              meta = JSON.parse(
                await this.fs.readFile(
                  filePath.replace(/\.html$/, NEXT_META_SUFFIX),
                  'utf8'
                )
              )
            } catch {}
          }

          data = {
            lastModified: mtime.getTime(),
            value: {
              kind: 'PAGE',
              html: fileData,
              pageData,
              postponed: meta?.postponed,
              headers: meta?.headers,
              status: meta?.status,
            },
          }
        }

        if (data) {
          memoryCache?.set(key, data)
        }
      } catch (_) {
        // unable to get data from disk
      }
    }

    if (data?.value?.kind === 'PAGE') {
      let cacheTags: undefined | string[]
      const tagsHeader = data.value.headers?.[NEXT_CACHE_TAGS_HEADER]

      if (typeof tagsHeader === 'string') {
        cacheTags = tagsHeader.split(',')
      }

      if (cacheTags?.length) {
        this.loadTagsManifest()

        const isStale = cacheTags.some((tag) => {
          return (
            tagsManifest?.items[tag]?.revalidatedAt &&
            tagsManifest?.items[tag].revalidatedAt >=
              (data?.lastModified || Date.now())
          )
        })

        // we trigger a blocking validation if an ISR page
        // had a tag revalidated, if we want to be a background
        // revalidation instead we return data.lastModified = -1
        if (isStale) {
          data = undefined
        }
      }
    }

    if (data && data?.value?.kind === 'FETCH') {
      this.loadTagsManifest()

      const combinedTags = [...(tags || []), ...(softTags || [])]

      const wasRevalidated = combinedTags.some((tag) => {
        if (this.revalidatedTags.includes(tag)) {
          return true
        }

        return (
          tagsManifest?.items[tag]?.revalidatedAt &&
          tagsManifest?.items[tag].revalidatedAt >=
            (data?.lastModified || Date.now())
        )
      })
      // When revalidate tag is called we don't return
      // stale data so it's updated right away
      if (wasRevalidated) {
        data = undefined
      }
    }

    return data ?? null
  }

  public async set(...args: Parameters<CacheHandler['set']>) {
    const [key, data, ctx] = args
    memoryCache?.set(key, {
      value: data,
      lastModified: Date.now(),
    })
    if (this.debug) {
      console.log('set', key)
    }

    if (!this.flushToDisk) return

    if (data?.kind === 'ROUTE') {
      const filePath = this.getFilePath(`${key}.body`, 'app')
      await this.fs.mkdir(path.dirname(filePath))
      await this.fs.writeFile(filePath, data.body)

      const meta: RouteMetadata = {
        headers: data.headers,
        status: data.status,
        postponed: undefined,
      }

      await this.fs.writeFile(
        filePath.replace(/\.body$/, NEXT_META_SUFFIX),
        JSON.stringify(meta, null, 2)
      )
      return
    }

    if (data?.kind === 'PAGE') {
      const isAppPath = typeof data.pageData === 'string'
      const htmlPath = this.getFilePath(
        `${key}.html`,
        isAppPath ? 'app' : 'pages'
      )
      await this.fs.mkdir(path.dirname(htmlPath))
      await this.fs.writeFile(htmlPath, data.html)

      await this.fs.writeFile(
        this.getFilePath(
          `${key}${
            isAppPath
              ? this.experimental.ppr
                ? RSC_PREFETCH_SUFFIX
                : RSC_SUFFIX
              : NEXT_DATA_SUFFIX
          }`,
          isAppPath ? 'app' : 'pages'
        ),
        isAppPath ? data.pageData : JSON.stringify(data.pageData)
      )

      if (data.headers || data.status) {
        const meta: RouteMetadata = {
          headers: data.headers,
          status: data.status,
          postponed: data.postponed,
        }

        await this.fs.writeFile(
          htmlPath.replace(/\.html$/, NEXT_META_SUFFIX),
          JSON.stringify(meta)
        )
      }
    } else if (data?.kind === 'FETCH') {
      const filePath = this.getFilePath(key, 'fetch')
      await this.fs.mkdir(path.dirname(filePath))
      await this.fs.writeFile(
        filePath,
        JSON.stringify({
          ...data,
          tags: ctx.tags,
        })
      )
    }
  }

  private detectFileKind(pathname: string) {
    if (!this.appDir && !this.pagesDir) {
      throw new Error(
        "Invariant: Can't determine file path kind, no page directory enabled"
      )
    }

    // If app directory isn't enabled, then assume it's pages and avoid the fs
    // hit.
    if (!this.appDir && this.pagesDir) {
      return 'pages'
    }
    // Otherwise assume it's a pages file if the pages directory isn't enabled.
    else if (this.appDir && !this.pagesDir) {
      return 'app'
    }

    // If both are enabled, we need to test each in order, starting with
    // `pages`.
    let filePath = this.getFilePath(pathname, 'pages')
    if (this.fs.existsSync(filePath)) {
      return 'pages'
    }

    filePath = this.getFilePath(pathname, 'app')
    if (this.fs.existsSync(filePath)) {
      return 'app'
    }

    throw new Error(
      `Invariant: Unable to determine file path kind for ${pathname}`
    )
  }

  private getFilePath(
    pathname: string,
    kind: 'app' | 'fetch' | 'pages'
  ): string {
    switch (kind) {
      case 'fetch':
        // we store in .next/cache/fetch-cache so it can be persisted
        // across deploys
        return path.join(
          this.serverDistDir,
          '..',
          'cache',
          'fetch-cache',
          pathname
        )
      case 'pages':
        return path.join(this.serverDistDir, 'pages', pathname)
      case 'app':
        return path.join(this.serverDistDir, 'app', pathname)
      default:
        throw new Error("Invariant: Can't determine file path kind")
    }
  }
}
