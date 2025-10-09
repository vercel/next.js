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
  NEXT_CACHE_TAGS_HEADER,
  PRERENDER_REVALIDATE_HEADER,
} from '../../../lib/constants'
import { toRoute } from '../to-route'
import { SharedCacheControls } from './shared-cache-controls.external'
import {
  getPrerenderResumeDataCache,
  getRenderResumeDataCache,
  workUnitAsyncStorage,
} from '../../app-render/work-unit-async-storage.external'
import { InvariantError } from '../../../shared/lib/invariant-error'
import type { Revalidate } from '../cache-control'
import { getPreviouslyRevalidatedTags } from '../../server-utils'
import { workAsyncStorage } from '../../app-render/work-async-storage.external'
import { DetachedPromise } from '../../../lib/detached-promise'
import { areTagsExpired, areTagsStale } from './tags-manifest.external'

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
  lastModified: number
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
    _tags: string | string[],
    _durations?: { expire?: number }
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
  readonly allowedRevalidateHeaderKeys?: string[]
  readonly minimalMode?: boolean
  readonly fetchCacheKeyPrefix?: string
  readonly isOnDemandRevalidate?: boolean
  readonly revalidatedTags?: readonly string[]

  private static readonly debug: boolean =
    !!process.env.NEXT_PRIVATE_DEBUG_CACHE
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
    allowedRevalidateHeaderKeys?: string[]
    requestHeaders: IncrementalCache['requestHeaders']
    maxMemoryCacheSize?: number
    getPrerenderManifest: () => DeepReadonly<PrerenderManifest>
    fetchCacheKeyPrefix?: string
    CurCacheHandler?: typeof CacheHandler
  }) {
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
          if (IncrementalCache.debug) {
            console.log('IncrementalCache: using filesystem cache handler')
          }
          CurCacheHandler = FileSystemCache
        }
      }
    } else if (IncrementalCache.debug) {
      console.log(
        'IncrementalCache: using custom cache handler',
        CurCacheHandler.name
      )
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

    if (minimalMode) {
      revalidatedTags = this.revalidatedTags = getPreviouslyRevalidatedTags(
        requestHeaders,
        this.prerenderManifest?.preview?.previewModeId
      )
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

  async lock(cacheKey: string): Promise<() => Promise<void> | void> {
    // Wait for any existing lock on this cache key to be released
    // This implements a simple queue-based locking mechanism
    while (true) {
      const lock = this.locks.get(cacheKey)

      if (IncrementalCache.debug) {
        console.log('IncrementalCache: lock get', cacheKey, !!lock)
      }

      // If no lock exists, we can proceed to acquire it
      if (!lock) break

      // Wait for the existing lock to be released before trying again
      await lock
    }

    // Create a new detached promise that will represent this lock
    // The resolve function (unlock) will be returned to the caller
    const { resolve, promise } = new DetachedPromise<void>()

    if (IncrementalCache.debug) {
      console.log('IncrementalCache: successfully locked', cacheKey)
    }

    // Store the lock promise in the locks map
    this.locks.set(cacheKey, promise)

    return () => {
      // Resolve the promise to release the lock.
      resolve()

      // Remove the lock from the map once it's released so that future gets
      // can acquire the lock.
      this.locks.delete(cacheKey)
    }
  }

  async revalidateTag(
    tags: string | string[],
    durations?: { expire?: number }
  ): Promise<void> {
    return this.cacheHandler?.revalidateTag(tags, durations)
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
      // handle Uint8Array body
      if (init.body instanceof Uint8Array) {
        bodyChunks.push(decoder.decode(init.body))
        ;(init as any)._ogBody = init.body
      } // handle ReadableStream body
      else if (typeof (init.body as any).getReader === 'function') {
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
      const workUnitStore = workUnitAsyncStorage.getStore()
      const resumeDataCache = workUnitStore
        ? getRenderResumeDataCache(workUnitStore)
        : null
      if (resumeDataCache) {
        const memoryCacheData = resumeDataCache.fetch.get(cacheKey)
        if (memoryCacheData?.kind === CachedRouteKind.FETCH) {
          if (IncrementalCache.debug) {
            console.log('IncrementalCache: rdc:hit', cacheKey)
          }

          return { isStale: false, value: memoryCacheData }
        } else if (IncrementalCache.debug) {
          console.log('IncrementalCache: rdc:miss', cacheKey)
        }
      } else {
        if (IncrementalCache.debug) {
          console.log('IncrementalCache: rdc:no-resume-data')
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

      const workStore = workAsyncStorage.getStore()
      const combinedTags = [...(ctx.tags || []), ...(ctx.softTags || [])]
      // if a tag was revalidated we don't return stale data
      if (
        combinedTags.some(
          (tag) =>
            this.revalidatedTags?.includes(tag) ||
            workStore?.pendingRevalidatedTags?.some((item) => item.tag === tag)
        )
      ) {
        if (IncrementalCache.debug) {
          console.log('IncrementalCache: expired tag', cacheKey)
        }

        return null
      }

      // As we're able to get the cache entry for this fetch, and the prerender
      // resume data cache (RDC) is available, it must have been populated by a
      // previous fetch, but was not yet present in the in-memory cache. This
      // could be the case when performing multiple renders in parallel during
      // build time where we de-duplicate the fetch calls.
      //
      // We add it to the RDC so that the next fetch call will be able to use it
      // and it won't have to reach into the fetch cache implementation.
      const workUnitStore = workUnitAsyncStorage.getStore()
      if (workUnitStore) {
        const prerenderResumeDataCache =
          getPrerenderResumeDataCache(workUnitStore)
        if (prerenderResumeDataCache) {
          if (IncrementalCache.debug) {
            console.log('IncrementalCache: rdc:set', cacheKey)
          }

          prerenderResumeDataCache.fetch.set(cacheKey, cacheData.value)
        }
      }

      const revalidate = ctx.revalidate || cacheData.value.revalidate
      const age =
        (performance.timeOrigin +
          performance.now() -
          (cacheData.lastModified || 0)) /
        1000

      let isStale = age > revalidate
      const data = cacheData.value.data

      if (areTagsExpired(combinedTags, cacheData.lastModified)) {
        return null
      } else if (areTagsStale(combinedTags, cacheData.lastModified)) {
        isStale = true
      }

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
    const cacheControl = this.cacheControls.get(toRoute(cacheKey))

    let isStale: boolean | -1 | undefined
    let revalidateAfter: Revalidate

    if (cacheData?.lastModified === -1) {
      isStale = -1
      revalidateAfter = -1 * CACHE_ONE_YEAR
    } else {
      const now = performance.timeOrigin + performance.now()
      const lastModified = cacheData?.lastModified || now

      revalidateAfter = this.calculateRevalidate(
        cacheKey,
        lastModified,
        this.dev ?? false,
        ctx.isFallback
      )

      isStale =
        revalidateAfter !== false && revalidateAfter < now ? true : undefined

      // If the stale time couldn't be determined based on the revalidation
      // time, we check if the tags are expired or stale.
      if (
        isStale === undefined &&
        (cacheData?.value?.kind === CachedRouteKind.APP_PAGE ||
          cacheData?.value?.kind === CachedRouteKind.APP_ROUTE)
      ) {
        const tagsHeader = cacheData.value.headers?.[NEXT_CACHE_TAGS_HEADER]

        if (typeof tagsHeader === 'string') {
          const cacheTags = tagsHeader.split(',')

          if (cacheTags.length > 0) {
            if (areTagsExpired(cacheTags, lastModified)) {
              isStale = -1
            } else if (areTagsStale(cacheTags, lastModified)) {
              isStale = true
            }
          }
        }
      }
    }

    if (cacheData) {
      entry = {
        isStale,
        cacheControl,
        revalidateAfter,
        value: cacheData.value,
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
      const workUnitStore = workUnitAsyncStorage.getStore()
      const prerenderResumeDataCache = workUnitStore
        ? getPrerenderResumeDataCache(workUnitStore)
        : null
      if (prerenderResumeDataCache) {
        if (IncrementalCache.debug) {
          console.log('IncrementalCache: rdc:set', pathname)
        }

        prerenderResumeDataCache.fetch.set(pathname, data)
      }
    }

    if (this.disableForTestmode || (this.dev && !ctx.fetchCache)) return

    pathname = this._getPathname(pathname, ctx.fetchCache)

    // FetchCache has upper limit of 2MB per-entry currently
    const itemSize = JSON.stringify(data).length
    if (
      ctx.fetchCache &&
      itemSize > 2 * 1024 * 1024 &&
      // We ignore the size limit when custom cache handler is being used, as it
      // might not have this limit
      !this.hasCustomCacheHandler &&
      // We also ignore the size limit when it's an implicit build-time-only
      // caching that the user isn't even aware of.
      !ctx.isImplicitBuildTimeCache
    ) {
      const warningText = `Failed to set Next.js data cache for ${ctx.fetchUrl || pathname}, items over 2MB can not be cached (${itemSize} bytes)`

      if (this.dev) {
        throw new Error(warningText)
      }
      console.warn(warningText)
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
