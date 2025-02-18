import type { CacheFs } from '../../../shared/lib/utils'
import type { PrerenderManifest } from '../../../build'
import {
  type IncrementalCacheValue,
  type IncrementalCacheEntry,
  type IncrementalCache as IncrementalCacheType,
  IncrementalCacheKind,
  CachedRouteKind,
} from '../../response-cache'
import type { Revalidate } from '../revalidate'
import type { DeepReadonly } from '../../../shared/lib/deep-readonly'

import FileSystemCache from './file-system-cache'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'

import {
  CACHE_ONE_YEAR,
  NEXT_CACHE_REVALIDATED_TAGS_HEADER,
  NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER,
  PRERENDER_REVALIDATE_HEADER,
} from '../../../lib/constants'
import { toRoute } from '../to-route'
import { SharedRevalidateTimings } from './shared-revalidate-timings'
import { workUnitAsyncStorageInstance } from '../../app-render/work-unit-async-storage-instance'
import {
  getPrerenderResumeDataCache,
  getRenderResumeDataCache,
} from '../../app-render/work-unit-async-storage.external'

export interface CacheHandlerContext {
  fs?: CacheFs
  dev?: boolean
  flushToDisk?: boolean
  serverDistDir?: string
  maxMemoryCacheSize?: number
  fetchCacheKeyPrefix?: string
  prerenderManifest?: PrerenderManifest
  revalidatedTags: string[]
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
    ..._args: Parameters<IncrementalCache['get']>
  ): Promise<CacheHandlerValue | null> {
    return {} as any
  }

  public async set(
    ..._args: Parameters<IncrementalCache['set']>
  ): Promise<void> {}

  public async revalidateTag(
    ..._args: Parameters<IncrementalCache['revalidateTag']>
  ): Promise<void> {}

  public resetRequestCache(): void {}
}

export class IncrementalCache implements IncrementalCacheType {
  readonly dev?: boolean
  readonly disableForTestmode?: boolean
  readonly cacheHandler?: CacheHandler
  readonly hasCustomCacheHandler: boolean
  readonly prerenderManifest: DeepReadonly<PrerenderManifest>
  readonly requestHeaders: Record<string, undefined | string | string[]>
  readonly requestProtocol?: 'http' | 'https'
  readonly allowedRevalidateHeaderKeys?: string[]
  readonly minimalMode?: boolean
  readonly fetchCacheKeyPrefix?: string
  readonly revalidatedTags?: string[]
  readonly isOnDemandRevalidate?: boolean

  private readonly locks = new Map<string, Promise<void>>()

  /**
   * The revalidate timings for routes. This will source the timings from the
   * prerender manifest until the in-memory cache is updated with new timings.
   */
  private readonly revalidateTimings: SharedRevalidateTimings

  constructor({
    fs,
    dev,
    flushToDisk,
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
    minimalMode?: boolean
    serverDistDir?: string
    flushToDisk?: boolean
    requestProtocol?: 'http' | 'https'
    allowedRevalidateHeaderKeys?: string[]
    requestHeaders: IncrementalCache['requestHeaders']
    maxMemoryCacheSize?: number
    getPrerenderManifest: () => DeepReadonly<PrerenderManifest>
    fetchCacheKeyPrefix?: string
    CurCacheHandler?: typeof CacheHandler
  }) {
    const debug = !!process.env.NEXT_PRIVATE_DEBUG_CACHE
    this.hasCustomCacheHandler = Boolean(CurCacheHandler)

    const cacheHandlersSymbol = Symbol.for('@next/cache-handlers')
    const _globalThis: typeof globalThis & {
      [cacheHandlersSymbol]?: {
        FetchCache?: typeof CacheHandler
      }
    } = globalThis

    if (!CurCacheHandler) {
      // if we have a global cache handler available leverage it
      const globalCacheHandler = _globalThis[cacheHandlersSymbol]

      if (globalCacheHandler?.FetchCache) {
        CurCacheHandler = globalCacheHandler.FetchCache
      } else {
        if (fs && serverDistDir) {
          if (debug) {
            console.log('using filesystem cache handler')
          }
          CurCacheHandler = FileSystemCache
        }
      }
    } else if (debug) {
      console.log('using custom cache handler', CurCacheHandler.name)
    }

    if (process.env.__NEXT_TEST_MAX_ISR_CACHE) {
      // Allow cache size to be overridden for testing purposes
      maxMemoryCacheSize = parseInt(process.env.__NEXT_TEST_MAX_ISR_CACHE, 10)
    }
    this.dev = dev
    this.disableForTestmode = process.env.NEXT_PRIVATE_TEST_PROXY === 'true'
    // this is a hack to avoid Webpack knowing this is equal to this.minimalMode
    // because we replace this.minimalMode to true in production bundles.
    const minimalModeKey = 'minimalMode'
    this[minimalModeKey] = minimalMode
    this.requestHeaders = requestHeaders
    this.requestProtocol = requestProtocol
    this.allowedRevalidateHeaderKeys = allowedRevalidateHeaderKeys
    this.prerenderManifest = getPrerenderManifest()
    this.revalidateTimings = new SharedRevalidateTimings(this.prerenderManifest)
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
      typeof requestHeaders[NEXT_CACHE_REVALIDATED_TAGS_HEADER] === 'string' &&
      requestHeaders[NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER] ===
        this.prerenderManifest?.preview?.previewModeId
    ) {
      revalidatedTags =
        requestHeaders[NEXT_CACHE_REVALIDATED_TAGS_HEADER].split(',')
    }

    if (CurCacheHandler) {
      this.cacheHandler = new CurCacheHandler({
        dev,
        fs,
        flushToDisk,
        serverDistDir,
        revalidatedTags,
        maxMemoryCacheSize,
        _requestHeaders: requestHeaders,
        fetchCacheKeyPrefix,
      })
    }
  }

  private calculateRevalidate(
    pathname: string,
    fromTime: number,
    dev: boolean,
    isFallback: boolean | undefined
  ): Revalidate {
    // in development we don't have a prerender-manifest
    // and default to always revalidating to allow easier debugging
    if (dev)
      return Math.floor(performance.timeOrigin + performance.now() - 1000)

    // if an entry isn't present in routes we fallback to a default
    // of revalidating after 1 second unless it's a fallback request.
    const initialRevalidateSeconds =
      this.revalidateTimings.get(toRoute(pathname)) ?? (isFallback ? false : 1)

    const revalidateAfter =
      typeof initialRevalidateSeconds === 'number'
        ? initialRevalidateSeconds * 1000 + fromTime
        : initialRevalidateSeconds

    return revalidateAfter
  }

  _getPathname(pathname: string, fetchCache?: boolean) {
    return fetchCache ? pathname : normalizePagePath(pathname)
  }

  resetRequestCache() {
    this.cacheHandler?.resetRequestCache?.()
  }

  async lock(cacheKey: string) {
    let unlockNext: () => Promise<void> = () => Promise.resolve()
    const existingLock = this.locks.get(cacheKey)

    if (existingLock) {
      await existingLock
    }

    const newLock = new Promise<void>((resolve) => {
      unlockNext = async () => {
        resolve()
        this.locks.delete(cacheKey) // Remove the lock upon release
      }
    })

    this.locks.set(cacheKey, newLock)
    return unlockNext
  }

  async revalidateTag(tags: string | string[]): Promise<void> {
    const _globalThis: typeof globalThis & {
      __nextCacheHandlers?: Record<
        string,
        import('../cache-handlers/types').CacheHandler
      >
    } = globalThis

    return Promise.all([
      // call expireTags on all configured cache handlers
      Object.values(_globalThis.__nextCacheHandlers || {}).map(
        (cacheHandler) =>
          typeof cacheHandler.expireTags === 'function' &&
          cacheHandler.expireTags(...(Array.isArray(tags) ? tags : [tags]))
      ),
      this.cacheHandler?.revalidateTag?.(tags),
    ]).then(() => {})
  }

  // x-ref: https://github.com/facebook/react/blob/2655c9354d8e1c54ba888444220f63e836925caa/packages/react/src/ReactFetch.js#L23
  async generateCacheKey(
    url: string,
    init: RequestInit | Request = {}
  ): Promise<string> {
    // this should be bumped anytime a fix is made to cache entries
    // that should bust the cache
    const MAIN_KEY_PREFIX = 'v3'

    const bodyChunks: string[] = []

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    if (init.body) {
      // handle ReadableStream body
      if (typeof (init.body as any).getReader === 'function') {
        const readableBody = init.body as ReadableStream<Uint8Array | string>

        const chunks: Uint8Array[] = []

        try {
          await readableBody.pipeTo(
            new WritableStream({
              write(chunk) {
                if (typeof chunk === 'string') {
                  chunks.push(encoder.encode(chunk))
                  bodyChunks.push(chunk)
                } else {
                  chunks.push(chunk)
                  bodyChunks.push(decoder.decode(chunk, { stream: true }))
                }
              },
            })
          )

          // Flush the decoder.
          bodyChunks.push(decoder.decode())

          // Create a new buffer with all the chunks.
          const length = chunks.reduce((total, arr) => total + arr.length, 0)
          const arrayBuffer = new Uint8Array(length)

          // Push each of the chunks into the new array buffer.
          let offset = 0
          for (const chunk of chunks) {
            arrayBuffer.set(chunk, offset)
            offset += chunk.length
          }

          ;(init as any)._ogBody = arrayBuffer
        } catch (err) {
          console.error('Problem reading body', err)
        }
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
        bodyChunks.push(await blob.text())
        ;(init as any)._ogBody = new Blob([arrayBuffer], { type: blob.type })
      } else if (typeof init.body === 'string') {
        bodyChunks.push(init.body)
        ;(init as any)._ogBody = init.body
      }
    }

    const headers =
      typeof (init.headers || {}).keys === 'function'
        ? Object.fromEntries(init.headers as Headers)
        : Object.assign({}, init.headers)

    // w3c trace context headers can break request caching and deduplication
    // so we remove them from the cache key
    if ('traceparent' in headers) delete headers['traceparent']
    if ('tracestate' in headers) delete headers['tracestate']

    const cacheString = JSON.stringify([
      MAIN_KEY_PREFIX,
      this.fetchCacheKeyPrefix || '',
      url,
      init.method,
      headers,
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
      const buffer = encoder.encode(cacheString)
      return bufferToHex(await crypto.subtle.digest('SHA-256', buffer))
    } else {
      const crypto = require('crypto') as typeof import('crypto')
      return crypto.createHash('sha256').update(cacheString).digest('hex')
    }
  }

  // get data from cache if available
  async get(
    cacheKey: string,
    ctx: {
      kind: IncrementalCacheKind
      revalidate?: Revalidate
      fetchUrl?: string
      fetchIdx?: number
      tags?: string[]
      softTags?: string[]
      isRoutePPREnabled?: boolean
      isFallback: boolean | undefined
    }
  ): Promise<IncrementalCacheEntry | null> {
    // Unlike other caches if we have a resume data cache, we use it even if
    // testmode would normally disable it or if requestHeaders say 'no-cache'.
    if (ctx.kind === IncrementalCacheKind.FETCH) {
      const workUnitStore = workUnitAsyncStorageInstance.getStore()
      const resumeDataCache = workUnitStore
        ? getRenderResumeDataCache(workUnitStore)
        : null
      if (resumeDataCache) {
        const memoryCacheData = resumeDataCache.fetch.get(cacheKey)
        if (memoryCacheData?.kind === CachedRouteKind.FETCH) {
          return {
            isStale: false,
            value: memoryCacheData,
            revalidateAfter: false,
            isFallback: false,
          }
        }
      }
    }

    // we don't leverage the prerender cache in dev mode
    // so that getStaticProps is always called for easier debugging
    if (
      this.disableForTestmode ||
      (this.dev &&
        (ctx.kind !== IncrementalCacheKind.FETCH ||
          this.requestHeaders['cache-control'] === 'no-cache'))
    ) {
      return null
    }

    const { isFallback } = ctx

    cacheKey = this._getPathname(
      cacheKey,
      ctx.kind === IncrementalCacheKind.FETCH
    )
    let entry: IncrementalCacheEntry | null = null
    let revalidate = ctx.revalidate

    const cacheData = await this.cacheHandler?.get(cacheKey, ctx)

    if (cacheData?.value?.kind === CachedRouteKind.FETCH) {
      const combinedTags = [...(ctx.tags || []), ...(ctx.softTags || [])]
      // if a tag was revalidated we don't return stale data
      if (
        combinedTags.some((tag) => {
          return this.revalidatedTags?.includes(tag)
        })
      ) {
        return null
      }

      revalidate = revalidate || cacheData.value.revalidate
      const age =
        (performance.timeOrigin +
          performance.now() -
          (cacheData.lastModified || 0)) /
        1000

      const isStale = age > revalidate
      const data = cacheData.value.data

      return {
        isStale: isStale,
        value: {
          kind: CachedRouteKind.FETCH,
          data,
          revalidate: revalidate,
        },
        revalidateAfter:
          performance.timeOrigin + performance.now() + revalidate * 1000,
        isFallback,
      } satisfies IncrementalCacheEntry
    }

    const curRevalidate = this.revalidateTimings.get(toRoute(cacheKey))

    let isStale: boolean | -1 | undefined
    let revalidateAfter: Revalidate

    if (cacheData?.lastModified === -1) {
      isStale = -1
      revalidateAfter = -1 * CACHE_ONE_YEAR
    } else {
      revalidateAfter = this.calculateRevalidate(
        cacheKey,
        cacheData?.lastModified || performance.timeOrigin + performance.now(),
        this.dev ? ctx.kind !== IncrementalCacheKind.FETCH : false,
        ctx.isFallback
      )
      isStale =
        revalidateAfter !== false &&
        revalidateAfter < performance.timeOrigin + performance.now()
          ? true
          : undefined
    }

    if (cacheData) {
      entry = {
        isStale,
        curRevalidate,
        revalidateAfter,
        value: cacheData.value,
        isFallback,
      }
    }

    if (
      !cacheData &&
      this.prerenderManifest.notFoundRoutes.includes(cacheKey)
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
        isFallback,
      }
      this.set(cacheKey, entry.value, ctx)
    }
    return entry
  }

  // populate the incremental cache with new data
  async set(
    pathname: string,
    data: IncrementalCacheValue | null,
    ctx: {
      revalidate?: Revalidate
      fetchCache?: boolean
      fetchUrl?: string
      fetchIdx?: number
      tags?: string[]
      isRoutePPREnabled?: boolean
      isFallback?: boolean
    }
  ) {
    // Even if we otherwise disable caching for testMode or if no fetchCache is
    // configured we still always stash results in the resume data cache if one
    // exists. This is because this is a transient in memory cache that
    // populates caches ahead of a dynamic render in dev mode to allow the RSC
    // debug info to have the right environment associated to it.
    if (data?.kind === CachedRouteKind.FETCH) {
      const workUnitStore = workUnitAsyncStorageInstance.getStore()
      const prerenderResumeDataCache = workUnitStore
        ? getPrerenderResumeDataCache(workUnitStore)
        : null
      if (prerenderResumeDataCache) {
        prerenderResumeDataCache.fetch.set(pathname, data)
      }
    }

    if (this.disableForTestmode || (this.dev && !ctx.fetchCache)) return

    pathname = this._getPathname(pathname, ctx.fetchCache)

    // FetchCache has upper limit of 2MB per-entry currently
    const itemSize = JSON.stringify(data).length
    if (
      ctx.fetchCache &&
      // we don't show this error/warning when a custom cache handler is being used
      // as it might not have this limit
      !this.hasCustomCacheHandler &&
      itemSize > 2 * 1024 * 1024
    ) {
      if (this.dev) {
        throw new Error(
          `Failed to set Next.js data cache, items over 2MB can not be cached (${itemSize} bytes)`
        )
      }
      return
    }

    try {
      // Set the value for the revalidate seconds so if it changes we can
      // update the cache with the new value.
      if (typeof ctx.revalidate !== 'undefined' && !ctx.fetchCache) {
        this.revalidateTimings.set(toRoute(pathname), ctx.revalidate)
      }

      await this.cacheHandler?.set(pathname, data, ctx)
    } catch (error) {
      console.warn('Failed to update prerender cache for', pathname, error)
    }
  }
}
