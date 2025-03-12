import type { CacheFs } from '../../../shared/lib/utils'
import type { PrerenderManifest } from '../../../build'
import {
  type IncrementalCacheValue,
  type IncrementalCacheEntry,
  type IncrementalCache as IncrementalCacheType,
  IncrementalCacheKind,
  CachedRouteKind,
  type IncrementalResponseCacheEntry,
  type IncrementalFetchCacheEntry,
  type GetIncrementalFetchCacheContext,
  type GetIncrementalResponseCacheContext,
  type CachedFetchValue,
  type SetIncrementalFetchCacheContext,
  type SetIncrementalResponseCacheContext,
} from '../../response-cache'
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
import { SharedCacheControls } from './shared-cache-controls'
import { workUnitAsyncStorageInstance } from '../../app-render/work-unit-async-storage-instance'
import {
  getPrerenderResumeDataCache,
  getRenderResumeDataCache,
} from '../../app-render/work-unit-async-storage.external'
import { getCacheHandlers } from '../../use-cache/handlers'
import { InvariantError } from '../../../shared/lib/invariant-error'
import type { Revalidate } from '../cache-control'

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
    _cacheKey: string,
    _ctx: GetIncrementalFetchCacheContext | GetIncrementalResponseCacheContext
  ): Promise<CacheHandlerValue | null> {
    return {} as any
  }

  public async set(
    _cacheKey: string,
    _data: IncrementalCacheValue | null,
    _ctx: SetIncrementalFetchCacheContext | SetIncrementalResponseCacheContext
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
   * The cache controls for routes. This will source the values from the
   * prerender manifest until the in-memory cache is updated with new values.
   */
  private readonly cacheControls: SharedCacheControls

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
    this.cacheControls = new SharedCacheControls(this.prerenderManifest)
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

    const cacheControl = this.cacheControls.get(toRoute(pathname))

    // if an entry isn't present in routes we fallback to a default
    // of revalidating after 1 second unless it's a fallback request.
    const initialRevalidateSeconds = cacheControl
      ? cacheControl.revalidate
      : isFallback
        ? false
        : 1

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
    const promises: Promise<void>[] = []

    if (this.cacheHandler?.revalidateTag) {
      promises.push(this.cacheHandler.revalidateTag(tags))
    }

    const handlers = getCacheHandlers()
    if (handlers) {
      tags = Array.isArray(tags) ? tags : [tags]
      for (const handler of handlers) {
        promises.push(handler.expireTags(...tags))
      }
    }

    await Promise.all(promises)
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

  async get(
    cacheKey: string,
    ctx: GetIncrementalFetchCacheContext
  ): Promise<IncrementalFetchCacheEntry | null>
  async get(
    cacheKey: string,
    ctx: GetIncrementalResponseCacheContext
  ): Promise<IncrementalResponseCacheEntry | null>
  async get(
    cacheKey: string,
    ctx: GetIncrementalFetchCacheContext | GetIncrementalResponseCacheContext
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
          return { isStale: false, value: memoryCacheData }
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

    cacheKey = this._getPathname(
      cacheKey,
      ctx.kind === IncrementalCacheKind.FETCH
    )

    const cacheData = await this.cacheHandler?.get(cacheKey, ctx)

    if (ctx.kind === IncrementalCacheKind.FETCH) {
      if (!cacheData) {
        return null
      }

      if (cacheData.value?.kind !== CachedRouteKind.FETCH) {
        throw new InvariantError(
          `Expected cached value for cache key ${JSON.stringify(cacheKey)} to be a "FETCH" kind, got ${JSON.stringify(cacheData.value?.kind)} instead.`
        )
      }

      const combinedTags = [...(ctx.tags || []), ...(ctx.softTags || [])]
      // if a tag was revalidated we don't return stale data
      if (
        combinedTags.some((tag) => {
          return this.revalidatedTags?.includes(tag)
        })
      ) {
        return null
      }

      const revalidate = ctx.revalidate || cacheData.value.revalidate
      const age =
        (performance.timeOrigin +
          performance.now() -
          (cacheData.lastModified || 0)) /
        1000

      const isStale = age > revalidate
      const data = cacheData.value.data

      return {
        isStale,
        value: { kind: CachedRouteKind.FETCH, data, revalidate },
      }
    } else if (cacheData?.value?.kind === CachedRouteKind.FETCH) {
      throw new InvariantError(
        `Expected cached value for cache key ${JSON.stringify(cacheKey)} not to be a ${JSON.stringify(ctx.kind)} kind, got "FETCH" instead.`
      )
    }

    let entry: IncrementalResponseCacheEntry | null = null
    const { isFallback } = ctx
    const cacheControl = this.cacheControls.get(toRoute(cacheKey))

    let isStale: boolean | -1 | undefined
    let revalidateAfter: Revalidate

    if (cacheData?.lastModified === -1) {
      isStale = -1
      revalidateAfter = -1 * CACHE_ONE_YEAR
    } else {
      revalidateAfter = this.calculateRevalidate(
        cacheKey,
        cacheData?.lastModified || performance.timeOrigin + performance.now(),
        this.dev ?? false,
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
        cacheControl,
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
        cacheControl,
        revalidateAfter,
        isFallback,
      }
      this.set(cacheKey, entry.value, { ...ctx, cacheControl })
    }
    return entry
  }

  async set(
    pathname: string,
    data: CachedFetchValue | null,
    ctx: SetIncrementalFetchCacheContext
  ): Promise<void>
  async set(
    pathname: string,
    data: Exclude<IncrementalCacheValue, CachedFetchValue> | null,
    ctx: SetIncrementalResponseCacheContext
  ): Promise<void>
  async set(
    pathname: string,
    data: IncrementalCacheValue | null,
    ctx: SetIncrementalFetchCacheContext | SetIncrementalResponseCacheContext
  ): Promise<void> {
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
      if (!ctx.fetchCache && ctx.cacheControl) {
        this.cacheControls.set(toRoute(pathname), ctx.cacheControl)
      }

      await this.cacheHandler?.set(pathname, data, ctx)
    } catch (error) {
      console.warn('Failed to update prerender cache for', pathname, error)
    }
  }
}
