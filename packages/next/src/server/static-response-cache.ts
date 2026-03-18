/**
 * In-memory HTTP response cache for static pre-rendered pages.
 *
 * Caches the complete HTTP response (status + headers + body) so that
 * subsequent requests for the same static page skip the entire framework
 * pipeline and write the response directly to the socket.
 *
 * Safety constraints:
 * - Only caches pages confirmed as pre-rendered (initialRevalidateSeconds === false)
 * - Bounded by max entries and max body size
 * - Disabled in dev mode and minimal mode
 * - Respects If-None-Match for 304 responses
 * - Invalidated on on-demand revalidation
 */

import type { IncomingMessage, ServerResponse } from 'http'

export interface CachedResponse {
  statusCode: number
  headers: [string, string | string[]][]
  body: Buffer
  /** Cached ETag value for fast 304 checks */
  etag: string | undefined
  /** Timestamp when this entry was cached */
  cachedAt: number
}

export interface StaticResponseCacheOptions {
  /** Maximum number of entries in the cache. Default: 128 */
  maxEntries?: number
  /** Maximum body size in bytes for a single entry. Default: 2MB */
  maxBodySize?: number
}

const DEFAULT_MAX_ENTRIES = 128
const DEFAULT_MAX_BODY_SIZE = 2 * 1024 * 1024 // 2MB

export class StaticResponseCache {
  private cache = new Map<string, CachedResponse>()
  private maxEntries: number
  private maxBodySize: number

  constructor(options?: StaticResponseCacheOptions) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES
    this.maxBodySize = options?.maxBodySize ?? DEFAULT_MAX_BODY_SIZE
  }

  /**
   * Try to serve a cached response. Returns true if the response was served
   * from cache, false if a cache miss occurred.
   */
  serve(
    cacheKey: string,
    req: IncomingMessage,
    res: ServerResponse
  ): boolean {
    const cached = this.cache.get(cacheKey)
    if (!cached) {
      return false
    }

    // Check If-None-Match for 304
    const reqEtag = req.headers['if-none-match']
    if (reqEtag && cached.etag && reqEtag === cached.etag) {
      res.statusCode = 304
      // Per RFC 7232: 304 MUST include Cache-Control, ETag, Vary
      for (const [name, value] of cached.headers) {
        const lower = name.toLowerCase()
        if (
          lower === 'etag' ||
          lower === 'cache-control' ||
          lower === 'vary' ||
          lower === 'content-location' ||
          lower === 'date' ||
          lower === 'expires'
        ) {
          res.setHeader(name, value)
        }
      }
      res.end()
      return true
    }

    // Serve the full cached response
    res.statusCode = cached.statusCode
    for (const [name, value] of cached.headers) {
      res.setHeader(name, value)
    }

    if (req.method === 'HEAD') {
      res.end()
    } else {
      res.end(cached.body)
    }
    return true
  }

  /**
   * Store a response in the cache. The body must not exceed maxBodySize.
   */
  set(cacheKey: string, entry: CachedResponse): void {
    if (entry.body.length > this.maxBodySize) {
      return
    }

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(cacheKey)) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(cacheKey, entry)
  }

  /**
   * Remove a specific entry (e.g., on revalidation).
   */
  delete(cacheKey: string): boolean {
    return this.cache.delete(cacheKey)
  }

  /**
   * Invalidate all entries for a given pathname (both html and rsc variants).
   * Cache keys are raw URLs (e.g., '/about', '/about.rsc') so we match
   * exact pathname or any variant starting with the pathname.
   */
  invalidate(pathname: string): void {
    // Direct match (html request)
    this.cache.delete(pathname)
    // RSC variant
    this.cache.delete(pathname + '.rsc')
    // Also delete any segment prefetch variants
    for (const key of this.cache.keys()) {
      if (key.startsWith(pathname + '.segments/')) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  has(cacheKey: string): boolean {
    return this.cache.has(cacheKey)
  }
}

/**
 * Build a cache key from a URL path. The raw URL is used directly since
 * RSC requests already have a `.rsc` suffix, which naturally differentiates
 * them from HTML requests.
 *
 * Query strings are stripped since static pages produce the same output
 * regardless of query parameters (the _rsc cache-busting param, etc.).
 */
export function buildCacheKey(url: string): string {
  const qIndex = url.indexOf('?')
  return qIndex === -1 ? url : url.slice(0, qIndex)
}

/**
 * Wraps a ServerResponse to capture the written output for caching.
 * After the response completes, the `onFinish` callback is invoked
 * with the captured data.
 *
 * This patches setHeader/write/end on the response object to record
 * all header writes and body chunks. The patched methods delegate to
 * the originals so the real response is still sent normally.
 */
export function createCapturingResponse(
  res: ServerResponse,
  onFinish: (captured: CachedResponse) => void
): ServerResponse {
  const chunks: Buffer[] = []
  const capturedHeaders: [string, string | string[]][] = []
  let finished = false

  // Store originals before patching
  const origSetHeader = res.setHeader.bind(res)
  const origWrite = res.write.bind(res)
  const origEnd = res.end.bind(res)

  res.setHeader = function (
    name: string,
    value: string | number | readonly string[]
  ): ServerResponse {
    const normalizedValue =
      typeof value === 'number'
        ? String(value)
        : Array.isArray(value)
          ? (value as string[])
          : (value as string)
    capturedHeaders.push([name, normalizedValue])
    return origSetHeader(name, value)
  }

  res.write = function (
    this: ServerResponse,
    ...args: any[]
  ): boolean {
    const chunk = args[0]
    if (chunk != null && !finished) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk)
      } else if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk))
      }
    }
    return origWrite(...args)
  }

  res.end = function (
    this: ServerResponse,
    ...args: any[]
  ): ServerResponse {
    if (!finished) {
      finished = true

      // Extract the body chunk from end() arguments (if any)
      const chunk = args[0]
      if (chunk != null && typeof chunk !== 'function') {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(chunk)
        } else if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk))
        }
      }

      const body = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0)

      // Find ETag from captured headers
      let etag: string | undefined
      for (const [name, value] of capturedHeaders) {
        if (name.toLowerCase() === 'etag') {
          etag = typeof value === 'string' ? value : value[0]
          break
        }
      }

      onFinish({
        statusCode: res.statusCode,
        headers: capturedHeaders,
        body,
        etag,
        cachedAt: Date.now(),
      })
    }

    return origEnd(...args)
  }

  return res
}
