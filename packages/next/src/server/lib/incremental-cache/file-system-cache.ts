import { getRouteCacheKey, ROUTE_CACHE_DIRECTORY } from '../route-cache-key'
import type { RouteMetadata } from '../../../export/routes/types'
import type { CacheHandler, CacheHandlerContext, CacheHandlerValue } from '.'
import type { CacheFs } from '../../../shared/lib/utils'
import type { TagManifestEntry } from './tags-manifest.external'
import {
  CachedRouteKind,
  IncrementalCacheKind,
  type CachedFetchValue,
  type IncrementalCacheValue,
  type GetIncrementalResponseCacheHandlerContext,
  type SetIncrementalFetchCacheContext,
  type SetIncrementalResponseCacheHandlerContext,
} from '../../response-cache'

import type { LRUCache } from '../lru-cache'
import path from '../../../shared/lib/isomorphic/path'
import {
  NEXT_CACHE_TAGS_HEADER,
  NEXT_DATA_SUFFIX,
  NEXT_META_SUFFIX,
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
  private static readonly seedReads = new Map<
    string,
    { readers: number; version: number; promotion?: Promise<void> }
  >()

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

  private getSeedReadState(key: string) {
    return FileSystemCache.seedReads.get(`${this.serverDistDir}:${key}`)
  }

  private beginSeedRead(key: string) {
    const stateKey = `${this.serverDistDir}:${key}`
    let state = FileSystemCache.seedReads.get(stateKey)
    if (!state) {
      state = { readers: 0, version: 0 }
      FileSystemCache.seedReads.set(stateKey, state)
    }
    state.readers++
    return { stateKey, state, version: state.version }
  }

  private finishSeedRead(
    stateKey: string,
    state: { readers: number; version: number; promotion?: Promise<void> }
  ) {
    state.readers--
    if (state.readers === 0 && !state.promotion) {
      FileSystemCache.seedReads.delete(stateKey)
    }
  }

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
    let readKey = key
    let seedRead: ReturnType<FileSystemCache['beginSeedRead']> | undefined

    let data = FileSystemCache.memoryCache?.get(key)

    const activePromotion = this.getSeedReadState(key)?.promotion
    if (!data && activePromotion) {
      await activePromotion
      data = FileSystemCache.memoryCache?.get(key)
    }

    if (FileSystemCache.debug) {
      if (kind === IncrementalCacheKind.FETCH) {
        console.log('FileSystemCache: get', key, ctx.tags, kind, !!data)
      } else {
        console.log('FileSystemCache: get', key, kind, !!data)
      }
    }

    const isResponse =
      kind === IncrementalCacheKind.PAGES ||
      kind === IncrementalCacheKind.APP_PAGE ||
      kind === IncrementalCacheKind.APP_ROUTE

    if (
      !data &&
      isResponse &&
      key.startsWith(`/${ROUTE_CACHE_DIRECTORY}/`) &&
      process.env.NEXT_RUNTIME !== 'edge'
    ) {
      const primaryPath = this.getFilePath(
        kind === IncrementalCacheKind.APP_ROUTE ? `${key}.body` : `${key}.html`,
        kind
      )
      if (!this.fs.existsSync(primaryPath)) {
        const marker = key.indexOf('/$/')
        if (marker !== -1) {
          const legacyKey = key.slice(marker + 2)
          const legacyMetaPath = this.getFilePath(
            `${legacyKey}${NEXT_META_SUFFIX}`,
            kind
          )
          try {
            const meta = JSON.parse(
              this.fs.readFileSync(legacyMetaPath, 'utf8')
            ) as RouteMetadata
            const namespaceEnd = key.indexOf('/$/')
            const ownerKey = meta.routeCache
              ? getRouteCacheKey('/', meta.routeCache.owner)
              : undefined
            if (
              meta.routeCache?.key === key &&
              (meta.routeCache.isFallback === Boolean(ctx.isFallback) ||
                // PPR also reads fallback shells through ordinary response and
                // navigation resume-data lookups, which set isFallback: false.
                (kind === IncrementalCacheKind.APP_PAGE &&
                  ctx.isRoutePPREnabled &&
                  meta.postponed != null)) &&
              ownerKey?.slice(0, ownerKey.indexOf('/$/')) ===
                key.slice(0, namespaceEnd)
            ) {
              readKey = legacyKey
              seedRead = this.beginSeedRead(key)
            }
          } catch {}
        }
      }
    }

    // Check the scoped disk entry first, or a verified immutable build seed
    // only when its scoped primary payload is genuinely absent.
    if (!data && process.env.NEXT_RUNTIME !== 'edge') {
      try {
        if (kind === IncrementalCacheKind.APP_ROUTE) {
          const filePath = this.getFilePath(
            `${readKey}.body`,
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
            lastModified: meta.routeCacheLastModified ?? mtime.getTime(),
            value: {
              kind: CachedRouteKind.APP_ROUTE,
              body: fileData,
              headers: meta.headers,
              status: meta.status,
            },
            cacheControl: meta.cacheControl,
          }
        } else {
          const filePath = this.getFilePath(
            kind === IncrementalCacheKind.FETCH ? readKey : `${readKey}.html`,
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
            // Metadata is required for both normal entries and fallback shells.
            // Promoted entries publish their primary payload last, so a missing
            // sidecar means the scoped entry is incomplete.
            const meta: RouteMetadata = JSON.parse(
              await this.fs.readFile(
                filePath.replace(/\.html$/, NEXT_META_SUFFIX),
                'utf8'
              )
            )

            let maybeSegmentData: Map<string, Buffer> | undefined
            if (meta?.segmentPaths) {
              // Collect all the segment data for this page.
              // TODO: To optimize file system reads, we should consider creating
              // separate cache entries for each segment, rather than storing them
              // all on the page's entry. Though the behavior is
              // identical regardless.
              const segmentData: Map<string, Buffer> = new Map()
              maybeSegmentData = segmentData
              const segmentsDir = readKey + RSC_SEGMENTS_DIR_SUFFIX
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
            if (
              !ctx.isFallback &&
              (!ctx.isRoutePPREnabled || meta?.postponed == null)
            ) {
              rscData = await this.fs.readFile(
                this.getFilePath(
                  `${readKey}${RSC_SUFFIX}`,
                  IncrementalCacheKind.APP_PAGE
                )
              )
            }

            data = {
              lastModified: meta.routeCacheLastModified ?? mtime.getTime(),
              value: {
                kind: CachedRouteKind.APP_PAGE,
                html: fileData,
                rscData,
                postponed: meta?.postponed,
                headers: meta?.headers,
                status: meta?.status,
                segmentData: maybeSegmentData,
              },
              cacheControl: meta?.cacheControl,
            }
          } else if (kind === IncrementalCacheKind.PAGES) {
            const meta: RouteMetadata = JSON.parse(
              await this.fs.readFile(
                filePath.replace(/\.html$/, NEXT_META_SUFFIX),
                'utf8'
              )
            )
            let pageData: string | object = {}

            if (!ctx.isFallback) {
              pageData = JSON.parse(
                await this.fs.readFile(
                  this.getFilePath(
                    `${readKey}${NEXT_DATA_SUFFIX}`,
                    IncrementalCacheKind.PAGES
                  ),
                  'utf8'
                )
              )
            }

            data = {
              lastModified: meta.routeCacheLastModified ?? mtime.getTime(),
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
          if (!seedRead) {
            FileSystemCache.memoryCache?.set(key, data)
          }
        }
      } catch {
        if (seedRead) {
          this.finishSeedRead(seedRead.stateKey, seedRead.state)
        }
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

          if (seedRead) {
            this.finishSeedRead(seedRead.stateKey, seedRead.state)
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

    if (seedRead && data) {
      const { stateKey, state, version } = seedRead
      try {
        if (state.version === version) {
          await this.promoteSeed(
            key,
            readKey,
            data,
            ctx as GetIncrementalResponseCacheHandlerContext,
            stateKey,
            state,
            version
          )
          if (
            state.version === version &&
            !FileSystemCache.memoryCache?.get(key)
          ) {
            FileSystemCache.memoryCache?.set(key, data)
          }
        }
      } finally {
        this.finishSeedRead(stateKey, state)
      }
    }

    return data ?? null
  }

  private async promoteSeed(
    key: string,
    seedKey: string,
    data: CacheHandlerValue,
    ctx: GetIncrementalResponseCacheHandlerContext,
    stateKey: string,
    state: { readers: number; version: number; promotion?: Promise<void> },
    version: number
  ) {
    const writeFileAtomic = this.fs.writeFileAtomic
    if (!this.flushToDisk || !writeFileAtomic || !data.value) return

    if (state.promotion) {
      await state.promotion
      return
    }

    const promotion = (async () => {
      const value = data.value
      if (
        !value ||
        state.version !== version ||
        (value.kind !== CachedRouteKind.PAGES &&
          value.kind !== CachedRouteKind.APP_PAGE &&
          value.kind !== CachedRouteKind.APP_ROUTE)
      ) {
        return
      }

      const kind = ctx.kind
      const primaryPath = this.getFilePath(
        value.kind === CachedRouteKind.APP_ROUTE
          ? `${key}.body`
          : `${key}.html`,
        kind
      )
      if (this.fs.existsSync(primaryPath)) return

      const seedPrimaryPath = this.getFilePath(
        value.kind === CachedRouteKind.APP_ROUTE
          ? `${seedKey}.body`
          : `${seedKey}.html`,
        kind
      )
      const seedMetaPath = seedPrimaryPath.replace(
        value.kind === CachedRouteKind.APP_ROUTE ? /\.body$/ : /\.html$/,
        NEXT_META_SUFFIX
      )
      const meta = JSON.parse(
        await this.fs.readFile(seedMetaPath, 'utf8')
      ) as RouteMetadata
      meta.routeCacheLastModified = data.lastModified

      // Copy every ancillary seed file first. The scoped primary payload is
      // the publication marker and is written only after metadata is complete.
      const ancillaryFiles: Array<{ path: string; data: Buffer | string }> = []
      if (value.kind === CachedRouteKind.PAGES && !ctx.isFallback) {
        ancillaryFiles.push({
          path: this.getFilePath(`${key}${NEXT_DATA_SUFFIX}`, kind),
          data: await this.fs.readFile(
            this.getFilePath(`${seedKey}${NEXT_DATA_SUFFIX}`, kind)
          ),
        })
      } else if (value.kind === CachedRouteKind.APP_PAGE) {
        if (
          !ctx.isFallback &&
          (!ctx.isRoutePPREnabled || meta.postponed == null)
        ) {
          ancillaryFiles.push({
            path: this.getFilePath(`${key}${RSC_SUFFIX}`, kind),
            data: await this.fs.readFile(
              this.getFilePath(`${seedKey}${RSC_SUFFIX}`, kind)
            ),
          })
        }
        ancillaryFiles.push(
          ...(await Promise.all(
            (meta.segmentPaths ?? []).map(async (segmentPath) => ({
              path: this.getFilePath(
                key +
                  RSC_SEGMENTS_DIR_SUFFIX +
                  segmentPath +
                  RSC_SEGMENT_SUFFIX,
                kind
              ),
              data: await this.fs.readFile(
                this.getFilePath(
                  seedKey +
                    RSC_SEGMENTS_DIR_SUFFIX +
                    segmentPath +
                    RSC_SEGMENT_SUFFIX,
                  kind
                )
              ),
            }))
          ))
        )
      }

      const writer = new MultiFileWriter(this.fs)
      for (const file of ancillaryFiles) writer.append(file.path, file.data)
      await writer.wait()
      if (state.version !== version) return

      const metaPath = primaryPath.replace(
        value.kind === CachedRouteKind.APP_ROUTE ? /\.body$/ : /\.html$/,
        NEXT_META_SUFFIX
      )
      await this.fs.mkdir(path.dirname(metaPath))
      await this.fs.writeFile(metaPath, JSON.stringify(meta))
      if (state.version !== version || this.fs.existsSync(primaryPath)) return

      await writeFileAtomic.call(
        this.fs,
        primaryPath,
        await this.fs.readFile(seedPrimaryPath)
      )
    })()

    state.promotion = promotion.catch((error) => {
      if (FileSystemCache.debug) {
        console.log('FileSystemCache: failed to promote build seed', error)
      }
    })
    try {
      await state.promotion
    } finally {
      if (state.promotion) state.promotion = undefined
      if (state.readers === 0) FileSystemCache.seedReads.delete(stateKey)
    }
  }

  public async set(
    key: string,
    data: IncrementalCacheValue | null,
    ctx:
      | SetIncrementalFetchCacheContext
      | SetIncrementalResponseCacheHandlerContext
  ) {
    const cacheControl = ctx.fetchCache ? undefined : ctx.cacheControl
    const seedState = this.getSeedReadState(key)
    if (seedState) seedState.version++

    FileSystemCache.memoryCache?.set(key, {
      value: data,
      lastModified: Date.now(),
      cacheControl,
    })

    if (FileSystemCache.debug) {
      console.log('FileSystemCache: set', key)
    }

    if (!this.flushToDisk || !data) return

    await seedState?.promotion

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
        prefetchHints: undefined,
        cacheControl,
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
      if (!ctx.fetchCache && !ctx.isFallback && !ctx.isRoutePPREnabled) {
        writer.append(
          this.getFilePath(
            `${key}${isAppPath ? RSC_SUFFIX : NEXT_DATA_SUFFIX}`,
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
          prefetchHints: undefined,
          cacheControl,
        }

        writer.append(
          htmlPath.replace(/\.html$/, NEXT_META_SUFFIX),
          JSON.stringify(meta)
        )
      } else {
        const meta: RouteMetadata = {
          headers: data.headers,
          status: data.status,
          postponed: undefined,
          segmentPaths: undefined,
          prefetchHints: undefined,
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

  private getFilePath(key: string, kind: IncrementalCacheKind): string {
    let rootDir: string
    switch (kind) {
      case IncrementalCacheKind.FETCH:
        // we store in .next/cache/fetch-cache so it can be persisted
        // across deploys
        rootDir = path.join(this.serverDistDir, '..', 'cache', 'fetch-cache')
        break
      case IncrementalCacheKind.PAGES:
        rootDir = path.join(this.serverDistDir, 'pages')
        break
      case IncrementalCacheKind.IMAGE:
      case IncrementalCacheKind.APP_PAGE:
      case IncrementalCacheKind.APP_ROUTE:
        rootDir = path.join(this.serverDistDir, 'app')
        break
      default:
        throw new Error(`Unexpected file path kind: ${kind}`)
    }

    // Scoped response artifacts live outside the compiled route and ASO files.
    if (
      (kind === IncrementalCacheKind.PAGES ||
        kind === IncrementalCacheKind.APP_PAGE ||
        kind === IncrementalCacheKind.APP_ROUTE) &&
      key.startsWith(`/${ROUTE_CACHE_DIRECTORY}/`)
    ) {
      rootDir = path.join(this.serverDistDir, '.')
    }

    const filePath = path.join(rootDir, key)
    if (!(filePath.startsWith(rootDir + path.sep) || filePath === rootDir)) {
      throw new Error(`Invalid file path: ${filePath}`)
    }

    return filePath
  }
}
