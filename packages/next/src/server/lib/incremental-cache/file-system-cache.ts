import type { RouteMetadata } from '../../../export/routes/types'
import type { CacheHandler, CacheHandlerContext, CacheHandlerValue } from '.'
import type { CacheFs } from '../../../shared/lib/utils'
import type { TagManifestEntry } from './tags-manifest.external'
import {
  CachedRouteKind,
  IncrementalCacheKind,
  type CachedFetchValue,
  type IncrementalCacheValue,
  type SetIncrementalFetchCacheContext,
  type SetIncrementalResponseCacheContext,
} from '../../response-cache'

import type { LRUCache } from '../lru-cache'
import path from '../../../shared/lib/isomorphic/path'
import {
  NEXT_CACHE_TAGS_HEADER,
  NEXT_DATA_SUFFIX,
  NEXT_META_SUFFIX,
  RSC_PREFETCH_SUFFIX,
  RSC_SEGMENT_SUFFIX,
  RSC_SEGMENTS_DIR_SUFFIX,
  RSC_SUFFIX,
} from '../../../lib/constants'
import { areTagsExpired, tagsManifest } from './tags-manifest.external'
import { MultiFileWriter } from '../../../lib/multi-file-writer'
import { getMemoryCache } from './memory-cache.external'

type FileSystemCacheContext = Omit<
  CacheHandlerContext,
  'fs' | 'serverDistDir'
> & {
  fs: CacheFs
  serverDistDir: string
}

export default class FileSystemCache implements CacheHandler {
  private fs: FileSystemCacheContext['fs']
  private flushToDisk?: FileSystemCacheContext['flushToDisk']
  private serverDistDir: FileSystemCacheContext['serverDistDir']
  private revalidatedTags: string[]
  private static debug: boolean = !!process.env.NEXT_PRIVATE_DEBUG_CACHE
  private static memoryCache: LRUCache<CacheHandlerValue> | undefined

  constructor(ctx: FileSystemCacheContext) {
    this.fs = ctx.fs
    this.flushToDisk = ctx.flushToDisk
    this.serverDistDir = ctx.serverDistDir
    this.revalidatedTags = ctx.revalidatedTags

    if (ctx.maxMemoryCacheSize) {
      if (!FileSystemCache.memoryCache) {
        if (FileSystemCache.debug) {
          console.log('FileSystemCache: using memory store for fetch cache')
        }

        FileSystemCache.memoryCache = getMemoryCache(ctx.maxMemoryCacheSize)
      } else if (FileSystemCache.debug) {
        console.log('FileSystemCache: memory store already initialized')
      }
    } else if (FileSystemCache.debug) {
      console.log('FileSystemCache: not using memory store for fetch cache')
    }
  }

  public resetRequestCache(): void {}

  public async revalidateTag(
    tags: string | string[],
    durations?: { expire?: number }
  ) {
    tags = typeof tags === 'string' ? [tags] : tags

    if (FileSystemCache.debug) {
      console.log('FileSystemCache: revalidateTag', tags, durations)
    }

    if (tags.length === 0) {
      return
    }

    const now = Date.now()

    for (const tag of tags) {
      const existingEntry = tagsManifest.get(tag) || {}

      if (durations) {
        // Use provided durations directly
        const updates: TagManifestEntry = { ...existingEntry }

        // mark as stale immediately
        updates.stale = now

        if (durations.expire !== undefined) {
          updates.expired = now + durations.expire * 1000 // Convert seconds to ms
        }

        tagsManifest.set(tag, updates)
      } else {
        // Update expired field for immediate expiration (default behavior when no durations provided)
        tagsManifest.set(tag, { ...existingEntry, expired: now })
      }
    }
  }

  public async get(...args: Parameters<CacheHandler['get']>) {
    const [key, ctx] = args
    const { kind } = ctx

    let data = FileSystemCache.memoryCache?.get(key)

    if (FileSystemCache.debug) {
      if (kind === IncrementalCacheKind.FETCH) {
        console.log('FileSystemCache: get', key, ctx.tags, kind, !!data)
      } else {
        console.log('FileSystemCache: get', key, kind, !!data)
      }
    }

    // let's check the disk for seed data
    if (!data && process.env.NEXT_RUNTIME !== 'edge') {
      try {
        if (kind === IncrementalCacheKind.APP_ROUTE) {
          const filePath = this.getFilePath(
            `${key}.body`,
            IncrementalCacheKind.APP_ROUTE
          )
          const fileData = await this.fs.readFile(filePath)
          const { mtime } = await this.fs.stat(filePath)

          const meta = JSON.parse(
            await this.fs.readFile(
              filePath.replace(/\.body$/, NEXT_META_SUFFIX),
              'utf8'
            )
          )

          data = {
            lastModified: mtime.getTime(),
            value: {
              kind: CachedRouteKind.APP_ROUTE,
              body: fileData,
              headers: meta.headers,
              status: meta.status,
            },
          }
        } else {
          const filePath = this.getFilePath(
            kind === IncrementalCacheKind.FETCH ? key : `${key}.html`,
            kind
          )

          const fileData = await this.fs.readFile(filePath, 'utf8')
          const { mtime } = await this.fs.stat(filePath)

          if (kind === IncrementalCacheKind.FETCH) {
            const { tags, fetchIdx, fetchUrl } = ctx

            if (!this.flushToDisk) return null

            const lastModified = mtime.getTime()
            const parsedData: CachedFetchValue = JSON.parse(fileData)
            data = {
              lastModified,
              value: parsedData,
            }

            if (data.value?.kind === CachedRouteKind.FETCH) {
              const storedTags = data.value?.tags

              // update stored tags if a new one is being added
              // TODO: remove this when we can send the tags
              // via header on GET same as SET
              if (!tags?.every((tag) => storedTags?.includes(tag))) {
                if (FileSystemCache.debug) {
                  console.log(
                    'FileSystemCache: tags vs storedTags mismatch',
                    tags,
                    storedTags
                  )
                }
                await this.set(key, data.value, {
                  fetchCache: true,
                  tags,
                  fetchIdx,
                  fetchUrl,
                })
              }
            }
          } else if (kind === IncrementalCacheKind.APP_PAGE) {
            // We try to load the metadata file, but if it fails, we don't
            // error. We also don't load it if this is a fallback.
            let meta: RouteMetadata | undefined
            try {
              meta = JSON.parse(
                await this.fs.readFile(
                  filePath.replace(/\.html$/, NEXT_META_SUFFIX),
                  'utf8'
                )
              )
            } catch {}

            let maybeSegmentData: Map<string, Buffer> | undefined
            if (meta?.segmentPaths) {
              // Collect all the segment data for this page.
              // TODO: To optimize file system reads, we should consider creating
              // separate cache entries for each segment, rather than storing them
              // all on the page's entry. Though the behavior is
              // identical regardless.
              const segmentData: Map<string, Buffer> = new Map()
              maybeSegmentData = segmentData
              const segmentsDir = key + RSC_SEGMENTS_DIR_SUFFIX
              await Promise.all(
                meta.segmentPaths.map(async (segmentPath: string) => {
                  const segmentDataFilePath = this.getFilePath(
                    segmentsDir + segmentPath + RSC_SEGMENT_SUFFIX,
                    IncrementalCacheKind.APP_PAGE
                  )
                  try {
                    segmentData.set(
                      segmentPath,
                      await this.fs.readFile(segmentDataFilePath)
                    )
                  } catch {
                    // This shouldn't happen, but if for some reason we fail to
                    // load a segment from the filesystem, treat it the same as if
                    // the segment is dynamic and does not have a prefetch.
                  }
                })
              )
            }

            let rscData: Buffer | undefined
            if (!ctx.isFallback) {
              rscData = await this.fs.readFile(
                this.getFilePath(
                  `${key}${ctx.isRoutePPREnabled ? RSC_PREFETCH_SUFFIX : RSC_SUFFIX}`,
                  IncrementalCacheKind.APP_PAGE
                )
              )
            }

            data = {
              lastModified: mtime.getTime(),
              value: {
                kind: CachedRouteKind.APP_PAGE,
                html: fileData,
                rscData,
                postponed: meta?.postponed,
                headers: meta?.headers,
                status: meta?.status,
                segmentData: maybeSegmentData,
              },
            }
          } else if (kind === IncrementalCacheKind.PAGES) {
            let meta: RouteMetadata | undefined
            let pageData: string | object = {}

            if (!ctx.isFallback) {
              pageData = JSON.parse(
                await this.fs.readFile(
                  this.getFilePath(
                    `${key}${NEXT_DATA_SUFFIX}`,
                    IncrementalCacheKind.PAGES
                  ),
                  'utf8'
                )
              )
            }

            data = {
              lastModified: mtime.getTime(),
              value: {
                kind: CachedRouteKind.PAGES,
                html: fileData,
                pageData,
                headers: meta?.headers,
                status: meta?.status,
              },
            }
          } else {
            throw new Error(
              `Invariant: Unexpected route kind ${kind} in file system cache.`
            )
          }
        }

        if (data) {
          FileSystemCache.memoryCache?.set(key, data)
        }
      } catch {
        return null
      }
    }

    if (
      data?.value?.kind === CachedRouteKind.APP_PAGE ||
      data?.value?.kind === CachedRouteKind.APP_ROUTE ||
      data?.value?.kind === CachedRouteKind.PAGES
    ) {
      const tagsHeader = data.value.headers?.[NEXT_CACHE_TAGS_HEADER]
      if (typeof tagsHeader === 'string') {
        const cacheTags = tagsHeader.split(',')

        // we trigger a blocking validation if an ISR page
        // had a tag revalidated, if we want to be a background
        // revalidation instead we return data.lastModified = -1
        if (
          cacheTags.length > 0 &&
          areTagsExpired(cacheTags, data.lastModified)
        ) {
          if (FileSystemCache.debug) {
            console.log('FileSystemCache: expired tags', cacheTags)
          }

          return null
        }
      }
    } else if (data?.value?.kind === CachedRouteKind.FETCH) {
      const combinedTags =
        ctx.kind === IncrementalCacheKind.FETCH
          ? [...(ctx.tags || []), ...(ctx.softTags || [])]
          : []

      // When revalidate tag is called we don't return stale data so it's
      // updated right away.
      if (combinedTags.some((tag) => this.revalidatedTags.includes(tag))) {
        if (FileSystemCache.debug) {
          console.log('FileSystemCache: was revalidated', combinedTags)
        }

        return null
      }

      if (areTagsExpired(combinedTags, data.lastModified)) {
        if (FileSystemCache.debug) {
          console.log('FileSystemCache: expired tags', combinedTags)
        }

        return null
      }
    }

    return data ?? null
  }

  public async set(
    key: string,
    data: IncrementalCacheValue | null,
    ctx: SetIncrementalFetchCacheContext | SetIncrementalResponseCacheContext
  ) {
    FileSystemCache.memoryCache?.set(key, {
      value: data,
      lastModified: Date.now(),
    })

    if (FileSystemCache.debug) {
      console.log('FileSystemCache: set', key)
    }

    if (!this.flushToDisk || !data) return

    // Create a new writer that will prepare to write all the files to disk
    // after their containing directory is created.
    const writer = new MultiFileWriter(this.fs)

    if (data.kind === CachedRouteKind.APP_ROUTE) {
      const filePath = this.getFilePath(
        `${key}.body`,
        IncrementalCacheKind.APP_ROUTE
      )

      writer.append(filePath, data.body)

      const meta: RouteMetadata = {
        headers: data.headers,
        status: data.status,
        postponed: undefined,
        segmentPaths: undefined,
      }

      writer.append(
        filePath.replace(/\.body$/, NEXT_META_SUFFIX),
        JSON.stringify(meta, null, 2)
      )
    } else if (
      data.kind === CachedRouteKind.PAGES ||
      data.kind === CachedRouteKind.APP_PAGE
    ) {
      const isAppPath = data.kind === CachedRouteKind.APP_PAGE
      const htmlPath = this.getFilePath(
        `${key}.html`,
        isAppPath ? IncrementalCacheKind.APP_PAGE : IncrementalCacheKind.PAGES
      )

      writer.append(htmlPath, data.html)

      // Fallbacks don't generate a data file.
      if (!ctx.fetchCache && !ctx.isFallback) {
        writer.append(
          this.getFilePath(
            `${key}${
              isAppPath
                ? ctx.isRoutePPREnabled
                  ? RSC_PREFETCH_SUFFIX
                  : RSC_SUFFIX
                : NEXT_DATA_SUFFIX
            }`,
            isAppPath
              ? IncrementalCacheKind.APP_PAGE
              : IncrementalCacheKind.PAGES
          ),
          isAppPath ? data.rscData! : JSON.stringify(data.pageData)
        )
      }

      if (data?.kind === CachedRouteKind.APP_PAGE) {
        let segmentPaths: string[] | undefined
        if (data.segmentData) {
          segmentPaths = []
          const segmentsDir = htmlPath.replace(
            /\.html$/,
            RSC_SEGMENTS_DIR_SUFFIX
          )

          for (const [segmentPath, buffer] of data.segmentData) {
            segmentPaths.push(segmentPath)
            const segmentDataFilePath =
              segmentsDir + segmentPath + RSC_SEGMENT_SUFFIX
            writer.append(segmentDataFilePath, buffer)
          }
        }

        const meta: RouteMetadata = {
          headers: data.headers,
          status: data.status,
          postponed: data.postponed,
          segmentPaths,
        }

        writer.append(
          htmlPath.replace(/\.html$/, NEXT_META_SUFFIX),
          JSON.stringify(meta)
        )
      }
    } else if (data.kind === CachedRouteKind.FETCH) {
      const filePath = this.getFilePath(key, IncrementalCacheKind.FETCH)
      writer.append(
        filePath,
        JSON.stringify({
          ...data,
          tags: ctx.fetchCache ? ctx.tags : [],
        })
      )
    }

    // Wait for all FS operations to complete.
    await writer.wait()
  }

  private getFilePath(pathname: string, kind: IncrementalCacheKind): string {
    switch (kind) {
      case IncrementalCacheKind.FETCH:
        // we store in .next/cache/fetch-cache so it can be persisted
        // across deploys
        return path.join(
          this.serverDistDir,
          '..',
          'cache',
          'fetch-cache',
          pathname
        )
      case IncrementalCacheKind.PAGES:
        return path.join(this.serverDistDir, 'pages', pathname)
      case IncrementalCacheKind.IMAGE:
      case IncrementalCacheKind.APP_PAGE:
      case IncrementalCacheKind.APP_ROUTE:
        return path.join(this.serverDistDir, 'app', pathname)
      default:
        throw new Error(`Unexpected file path kind: ${kind}`)
    }
  }
}
