import type { CacheFs } from '../../../shared/lib/utils'
import type { PrerenderManifest } from '../../../build'
import type {
  IncrementalCacheValue,
  IncrementalCacheEntry,
  IncrementalCache as IncrementalCacheType,
  IncrementalCacheKindHint,
} from '../../response-cache'

import FetchCache from './fetch-cache'
import FileSystemCache from './file-system-cache'
import path from '../../../shared/lib/isomorphic/path'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'

import {
  CACHE_ONE_YEAR,
  NEXT_CACHE_REVALIDATED_TAGS_HEADER,
  NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER,
  PRERENDER_REVALIDATE_HEADER,
} from '../../../lib/constants'

function toRoute(pathname: string): string {
  return pathname.replace(/\/$/, '').replace(/\/index$/, '') || '/'
}

export interface CacheHandlerContext {
  fs?: CacheFs
  dev?: boolean
  flushToDisk?: boolean
  serverDistDir?: string
  maxMemoryCacheSize?: number
  fetchCacheKeyPrefix?: string
  prerenderManifest?: PrerenderManifest
  revalidatedTags: string[]
  experimental: { ppr: boolean }
  _appDir: boolean
  _pagesDir: boolean
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

  public async revalidateTag(_tag: string): Promise<void> {}

  public resetRequestCache(): void {}
}

export class IncrementalCache implements IncrementalCacheType {
  dev?: boolean
  cacheHandler?: CacheHandler
  hasCustomCacheHandler: boolean
  prerenderManifest: PrerenderManifest
  requestHeaders: Record<string, undefined | string | string[]>
  requestProtocol?: 'http' | 'https'
  allowedRevalidateHeaderKeys?: string[]
  minimalMode?: boolean
  fetchCacheKeyPrefix?: string
  revalidatedTags?: string[]
  isOnDemandRevalidate?: boolean
  private locks = new Map<string, Promise<void>>()
  private unlocks = new Map<string, () => Promise<void>>()

  constructor({
    fs,
    dev,
    appDir,
    pagesDir,
    flushToDisk,
    fetchCache,
    minimalMode,
    serverDistDir,
    requestHeaders,
    requestProtocol,
    maxMemoryCacheSize,
    getPrerenderManifest,
    fetchCacheKeyPrefix,
    CurCacheHandler,
    allowedRevalidateHeaderKeys,
    experimental,
  }: {
    fs?: CacheFs
    dev: boolean
    appDir?: boolean
    pagesDir?: boolean
    fetchCache?: boolean
    minimalMode?: boolean
    serverDistDir?: string
    flushToDisk?: boolean
    requestProtocol?: 'http' | 'https'
    allowedRevalidateHeaderKeys?: string[]
    requestHeaders: IncrementalCache['requestHeaders']
    maxMemoryCacheSize?: number
    getPrerenderManifest: () => PrerenderManifest
    fetchCacheKeyPrefix?: string
    CurCacheHandler?: typeof CacheHandler
    experimental: { ppr: boolean }
  }) {
    const debug = !!process.env.NEXT_PRIVATE_DEBUG_CACHE
    this.hasCustomCacheHandler = Boolean(CurCacheHandler)
    if (!CurCacheHandler) {
      if (fs && serverDistDir) {
        if (debug) {
          console.log('using filesystem cache handler')
        }
        CurCacheHandler = FileSystemCache
      }
      if (
        FetchCache.isAvailable({ _requestHeaders: requestHeaders }) &&
        minimalMode &&
        fetchCache
      ) {
        if (debug) {
          console.log('using fetch cache handler')
        }
        CurCacheHandler = FetchCache
      }
    } else if (debug) {
      console.log('using custom cache handler', CurCacheHandler.name)
    }

    if (process.env.__NEXT_TEST_MAX_ISR_CACHE) {
      // Allow cache size to be overridden for testing purposes
      maxMemoryCacheSize = parseInt(process.env.__NEXT_TEST_MAX_ISR_CACHE, 10)
    }
    this.dev = dev
    // this is a hack to avoid Webpack knowing this is equal to this.minimalMode
    // because we replace this.minimalMode to true in production bundles.
    const minimalModeKey = 'minimalMode'
    this[minimalModeKey] = minimalMode
    this.requestHeaders = requestHeaders
    this.requestProtocol = requestProtocol
    this.allowedRevalidateHeaderKeys = allowedRevalidateHeaderKeys
    this.prerenderManifest = getPrerenderManifest()
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
        _pagesDir: !!pagesDir,
        _appDir: !!appDir,
        _requestHeaders: requestHeaders,
        fetchCacheKeyPrefix,
        experimental,
      })
    }
  }

  private calculateRevalidate(
    pathname: string,
    fromTime: number,
    dev?: boolean
  ): number | false {
    // in development we don't have a prerender-manifest
    // and default to always revalidating to allow easier debugging
    if (dev) return new Date().getTime() - 1000

    // if an entry isn't present in routes we fallback to a default
    // of revalidating after 1 second
    const { initialRevalidateSeconds } = this.prerenderManifest.routes[
      toRoute(pathname)
    ] || {
      initialRevalidateSeconds: 1,
    }
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

  async unlock(cacheKey: string) {
    const unlock = this.unlocks.get(cacheKey)
    if (unlock) {
      unlock()
      this.locks.delete(cacheKey)
      this.unlocks.delete(cacheKey)
    }
  }

  async lock(cacheKey: string) {
    if (
      process.env.__NEXT_INCREMENTAL_CACHE_IPC_PORT &&
      process.env.__NEXT_INCREMENTAL_CACHE_IPC_KEY &&
      process.env.NEXT_RUNTIME !== 'edge'
    ) {
      const invokeIpcMethod = require('../server-ipc/request-utils')
        .invokeIpcMethod as typeof import('../server-ipc/request-utils').invokeIpcMethod

      await invokeIpcMethod({
        method: 'lock',
        ipcPort: process.env.__NEXT_INCREMENTAL_CACHE_IPC_PORT,
        ipcKey: process.env.__NEXT_INCREMENTAL_CACHE_IPC_KEY,
        args: [cacheKey],
      })

      return async () => {
        await invokeIpcMethod({
          method: 'unlock',
          ipcPort: process.env.__NEXT_INCREMENTAL_CACHE_IPC_PORT,
          ipcKey: process.env.__NEXT_INCREMENTAL_CACHE_IPC_KEY,
          args: [cacheKey],
        })
      }
    }

    let unlockNext: () => Promise<void> = () => Promise.resolve()
    const existingLock = this.locks.get(cacheKey)

    if (existingLock) {
      await existingLock
    } else {
      const newLock = new Promise<void>((resolve) => {
        unlockNext = async () => {
          resolve()
        }
      })

      this.locks.set(cacheKey, newLock)
      this.unlocks.set(cacheKey, unlockNext)
    }

    return unlockNext
  }

  async revalidateTag(tag: string) {
    if (
      process.env.__NEXT_INCREMENTAL_CACHE_IPC_PORT &&
      process.env.__NEXT_INCREMENTAL_CACHE_IPC_KEY &&
      process.env.NEXT_RUNTIME !== 'edge'
    ) {
      const invokeIpcMethod = require('../server-ipc/request-utils')
        .invokeIpcMethod as typeof import('../server-ipc/request-utils').invokeIpcMethod
      return invokeIpcMethod({
        method: 'revalidateTag',
        ipcPort: process.env.__NEXT_INCREMENTAL_CACHE_IPC_PORT,
        ipcKey: process.env.__NEXT_INCREMENTAL_CACHE_IPC_KEY,
        args: [...arguments],
      })
    }

    return this.cacheHandler?.revalidateTag?.(tag)
  }

  // x-ref: https://github.com/facebook/react/blob/2655c9354d8e1c54ba888444220f63e836925caa/packages/react/src/ReactFetch.js#L23
  async fetchCacheKey(
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

    const cacheString = JSON.stringify([
      MAIN_KEY_PREFIX,
      this.fetchCacheKeyPrefix || '',
      url,
      init.method,
      typeof (init.headers || {}).keys === 'function'
        ? Object.fromEntries(init.headers as Headers)
        : init.headers,
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
      kindHint?: IncrementalCacheKindHint
      revalidate?: number | false
      fetchUrl?: string
      fetchIdx?: number
      tags?: string[]
      softTags?: string[]
    } = {}
  ): Promise<IncrementalCacheEntry | null> {
    if (
      process.env.__NEXT_INCREMENTAL_CACHE_IPC_PORT &&
      process.env.__NEXT_INCREMENTAL_CACHE_IPC_KEY &&
      process.env.NEXT_RUNTIME !== 'edge'
    ) {
      const invokeIpcMethod = require('../server-ipc/request-utils')
        .invokeIpcMethod as typeof import('../server-ipc/request-utils').invokeIpcMethod

      return invokeIpcMethod({
        method: 'get',
        ipcPort: process.env.__NEXT_INCREMENTAL_CACHE_IPC_PORT,
        ipcKey: process.env.__NEXT_INCREMENTAL_CACHE_IPC_KEY,
        args: [...arguments],
      })
    }

    // we don't leverage the prerender cache in dev mode
    // so that getStaticProps is always called for easier debugging
    if (
      this.dev &&
      (ctx.kindHint !== 'fetch' ||
        this.requestHeaders['cache-control'] === 'no-cache')
    ) {
      return null
    }

    cacheKey = this._getPathname(cacheKey, ctx.kindHint === 'fetch')
    let entry: IncrementalCacheEntry | null = null
    let revalidate = ctx.revalidate

    const cacheData = await this.cacheHandler?.get(cacheKey, ctx)

    if (cacheData?.value?.kind === 'FETCH') {
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
      const age = (Date.now() - (cacheData.lastModified || 0)) / 1000

      const isStale = age > revalidate
      const data = cacheData.value.data

      return {
        isStale: isStale,
        value: {
          kind: 'FETCH',
          data,
          revalidate: revalidate,
        },
        revalidateAfter: Date.now() + revalidate * 1000,
      }
    }

    const curRevalidate =
      this.prerenderManifest.routes[toRoute(cacheKey)]?.initialRevalidateSeconds

    let isStale: boolean | -1 | undefined
    let revalidateAfter: false | number

    if (cacheData?.lastModified === -1) {
      isStale = -1
      revalidateAfter = -1 * CACHE_ONE_YEAR
    } else {
      revalidateAfter = this.calculateRevalidate(
        cacheKey,
        cacheData?.lastModified || Date.now(),
        this.dev && ctx.kindHint !== 'fetch'
      )
      isStale =
        revalidateAfter !== false && revalidateAfter < Date.now()
          ? true
          : undefined
    }

    if (cacheData) {
      entry = {
        isStale,
        curRevalidate,
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
        curRevalidate,
        revalidateAfter,
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
      revalidate?: number | false
      fetchCache?: boolean
      fetchUrl?: string
      fetchIdx?: number
      tags?: string[]
    }
  ) {
    if (
      process.env.__NEXT_INCREMENTAL_CACHE_IPC_PORT &&
      process.env.__NEXT_INCREMENTAL_CACHE_IPC_KEY &&
      process.env.NEXT_RUNTIME !== 'edge'
    ) {
      const invokeIpcMethod = require('../server-ipc/request-utils')
        .invokeIpcMethod as typeof import('../server-ipc/request-utils').invokeIpcMethod

      return invokeIpcMethod({
        method: 'set',
        ipcPort: process.env.__NEXT_INCREMENTAL_CACHE_IPC_PORT,
        ipcKey: process.env.__NEXT_INCREMENTAL_CACHE_IPC_KEY,
        args: [...arguments],
      })
    }

    if (this.dev && !ctx.fetchCache) return
    // FetchCache has upper limit of 2MB per-entry currently
    if (
      ctx.fetchCache &&
      // we don't show this error/warning when a custom cache handler is being used
      // as it might not have this limit
      !this.hasCustomCacheHandler &&
      JSON.stringify(data).length > 2 * 1024 * 1024
    ) {
      if (this.dev) {
        throw new Error(`fetch for over 2MB of data can not be cached`)
      }
      return
    }

    pathname = this._getPathname(pathname, ctx.fetchCache)

    try {
      // we use the prerender manifest memory instance
      // to store revalidate timings for calculating
      // revalidateAfter values so we update this on set
      if (typeof ctx.revalidate !== 'undefined' && !ctx.fetchCache) {
        this.prerenderManifest.routes[pathname] = {
          experimentalPPR: undefined,
          dataRoute: path.posix.join(
            '/_next/data',
            `${normalizePagePath(pathname)}.json`
          ),
          srcRoute: null, // FIXME: provide actual source route, however, when dynamically appending it doesn't really matter
          initialRevalidateSeconds: ctx.revalidate,
          // Pages routes do not have a prefetch data route.
          prefetchDataRoute: undefined,
        }
      }
      await this.cacheHandler?.set(pathname, data, ctx)
    } catch (error) {
      console.warn('Failed to update prerender cache for', pathname, error)
    }
  }
}
