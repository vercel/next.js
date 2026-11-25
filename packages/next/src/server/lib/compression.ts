/*!
 * Multi-encoding response compression middleware (gzip, brotli, zstd).
 *
 * This file is derived from the `compression` npm package (MIT Licensed):
 *   Copyright(c) 2010 Sencha Inc.
 *   Copyright(c) 2011 TJ Holowaychuk
 *   Copyright(c) 2014 Jonathan Ong
 *   Copyright(c) 2014-2015 Douglas Christopher Wilson
 *   MIT Licensed
 *
 * It extends the original single-encoding (gzip/deflate) middleware with
 * `Accept-Encoding` negotiation for brotli and zstd, both implemented on top
 * of Node's built-in `zlib` module, so no extra native dependency is needed.
 * zstd requires Node.js >= 23.8 (or >= 22.15); on older versions it is
 * dropped from negotiation with a one-time warning.
 *
 * The streaming/flow-control structure is intentionally kept identical to the
 * `compression` package so `releaseCompressionStream()` keeps working: the
 * response's `drain` event is proxied to the zlib stream while it exists.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import zlib from 'node:zlib'

import { warn } from '../../build/output/log'
import type { CompressOptions } from '../config-shared'

/** The compression algorithms this middleware can produce. */
export type CompressionAlgorithm = 'gzip' | 'brotli' | 'zstd'

/**
 * The `Content-Encoding` token used on the wire for each algorithm.
 * `brotli` negotiates as `br`, everything else uses its own name.
 */
export const CONTENT_ENCODING_NAMES: Record<CompressionAlgorithm, string> = {
  gzip: 'gzip',
  brotli: 'br',
  zstd: 'zstd',
}

/**
 * On-disk sidecar extension used to store each pre-compressed variant of a
 * static asset next to the original (e.g. `file.js` + `.br`).
 */
export const PRECOMPRESSED_EXTENSIONS: Record<CompressionAlgorithm, string> = {
  gzip: '.gz',
  brotli: '.br',
  zstd: '.zst',
}

/**
 * Preference order for pre-compressed static variants: brotli wins over zstd
 * for static assets because the compression happens once at build time, so
 * the better ratio costs nothing at request time.
 */
export function staticSidecarOrder(
  algorithms: CompressionAlgorithm[]
): CompressionAlgorithm[] {
  return (['brotli', 'zstd', 'gzip'] as CompressionAlgorithm[]).filter(
    (algorithm) => algorithms.includes(algorithm)
  )
}

export interface MultiEncodingCompressionOptions {
  /**
   * Algorithms to negotiate, most preferred first. Only algorithms listed
   * here are ever selected, regardless of the client's preferences.
   */
  algorithms: CompressionAlgorithm[]
  /**
   * Only compress responses known to be at least this many bytes
   * (default: 1024, matching the `compression` package).
   */
  threshold?: number
  /** `zlib` level for gzip (0-9). */
  gzipLevel?: number
  /** `zlib` BROTLI_PARAM_QUALITY (0-11). */
  brotliQuality?: number
  /** `zlib` level for zstd (1-22). */
  zstdLevel?: number
}

// Node's zstd zlib bindings (`createZstdCompress`) shipped in v23.8.0 /
// v22.15.0 and are absent everywhere older; the type definitions available
// to this codebase do not declare them yet.
type ZlibWithZstd = typeof zlib & {
  createZstdCompress?: (options?: { level?: number }) => Duplex
}

/**
 * zstd support landed in Node's zlib in v23.8.0 / v22.15.0 and is absent
 * everywhere older. Checked lazily so importing this module never throws.
 */
export function isZstdSupported(): boolean {
  return typeof (zlib as ZlibWithZstd).createZstdCompress === 'function'
}

// `ServerResponse` keeps the implicit-header state it exposes to the
// `compression` package's streaming contract private; these are the two
// members this middleware touches.
type ServerResponseInternals = ServerResponse & {
  _header?: unknown
  _implicitHeader: () => void
  flush?: () => void
}

let warnedMissingZstd = false

/**
 * Resolves the user-facing `compress` config into a concrete negotiation
 * setup. Accepts the legacy `boolean` as well as the opt-in object form.
 * Returns `null` when compression is disabled entirely.
 */
export function normalizeCompressConfig(
  compress: boolean | CompressOptions | undefined
): (MultiEncodingCompressionOptions & { staticPrecompress: boolean }) | null {
  if (compress === false) {
    return null
  }

  // Legacy/default behavior: gzip only, exactly like the `compression`
  // middleware with no options.
  if (compress === undefined || compress === true) {
    return {
      algorithms: ['gzip'],
      staticPrecompress: false,
    }
  }

  const algorithms: CompressionAlgorithm[] = []
  // Preference order. `zstd` first: it decompresses far faster than brotli,
  // which matters most on the dynamic path this middleware serves.
  if (compress.zstd) algorithms.push('zstd')
  if (compress.brotli) algorithms.push('brotli')
  if (compress.gzip !== false) algorithms.push('gzip')

  if (algorithms.includes('zstd') && !isZstdSupported()) {
    if (!warnedMissingZstd) {
      warnedMissingZstd = true
      warn(
        '`compress.zstd` was requested, but this Node.js version (' +
          process.version +
          ') has no zstd support in zlib. zstd is disabled; upgrade to Node.js >= 22.15.'
      )
    }
    algorithms.splice(algorithms.indexOf('zstd'), 1)
  }

  if (algorithms.length === 0) {
    return null
  }

  return {
    algorithms,
    threshold: compress.threshold ?? 1024,
    gzipLevel: compress.gzipLevel,
    brotliQuality: compress.brotliQuality,
    zstdLevel: compress.zstdLevel,
    staticPrecompress: compress.staticPrecompress === true,
  }
}

/**
 * Parses an `Accept-Encoding` header into `token -> quality` pairs.
 * `q=0` means explicitly not acceptable. Exported for testing.
 */
export function parseAcceptEncoding(
  header: string | undefined | null
): Map<string, number> {
  const result = new Map<string, number>()
  if (!header) return result

  for (const part of header.split(',')) {
    const [token, ...params] = part.trim().split(';')
    if (!token) continue

    let quality = 1
    for (const param of params) {
      const [key, value] = param.split('=')
      if (key.trim().toLowerCase() === 'q' && value !== undefined) {
        const parsed = Number(value)
        // Follow RFC 9110 clamping for well-formed but out-of-range values.
        quality = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0
      }
    }

    result.set(token.trim().toLowerCase(), quality)
  }

  return result
}

/**
 * The acceptable algorithms among `candidates`, in preference order (most
 * preferred first): quality wins, the candidate order breaks ties, and
 * explicit `name;q=0` beats `*`. `*` accepts any encoding except `identity`.
 * Exported for the static path, which walks the order until a variant it has
 * on disk is acceptable.
 */
export function negotiateEncodingOrder(
  header: string | undefined | null,
  candidates: CompressionAlgorithm[]
): CompressionAlgorithm[] {
  const qualities = parseAcceptEncoding(header)
  return (
    candidates
      .map((algorithm) => ({
        algorithm,
        quality:
          qualities.get(CONTENT_ENCODING_NAMES[algorithm]) ??
          qualities.get('*') ??
          0,
      }))
      .filter(({ quality }) => quality > 0)
      // `Array#sort` is stable, so equal qualities keep the candidate order.
      .sort((a, b) => b.quality - a.quality)
      .map(({ algorithm }) => algorithm)
  )
}

/** The best acceptable algorithm, or `null` when nothing is acceptable. */
export function negotiateEncoding(
  header: string | undefined | null,
  candidates: CompressionAlgorithm[]
): CompressionAlgorithm | null {
  return negotiateEncodingOrder(header, candidates)[0] ?? null
}

/** The request's `Accept-Encoding`, flattened from Node's duplicated-header array. */
export function getAcceptEncoding(req: IncomingMessage): string | undefined {
  const header = req.headers['accept-encoding']
  return Array.isArray(header) ? header.join(',') : header
}

// Mirrors the `compressible` package's heuristic (MIT Licensed), without
// depending on the full mime-db table.
const COMPRESSIBLE_TYPE_RE =
  /^(?:application\/(?:[a-z][-\w]*\+)?(?:ecma(?:script)?|json|graphql|xhtml|xml|javascript|x-javascript|x-ecmascript|typescript|rss|xhtml\+xml|manifest)|text\/[a-z][-\w]*|image\/svg\+xml|image\/vnd\.(?:garage|illustrator|fns)|font\/(?:ttf|otf)|application\/(?:x-font-ttf|x-opentype))/i

const INCOMPRESSIBLE_EXCEPTIONS = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/jxl',
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/tiff',
  'font/woff',
  'font/woff2',
  'application/wasm',
  'video/mp4',
  'video/mpeg',
  'video/webm',
  'video/ogg',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/aac',
  'audio/flac',
  'application/zip',
  'application/gzip',
  'application/zstd',
  'application/brotli',
  'application/x-brotli',
  'application/pdf',
])

/** Whether a `Content-Type` value is worth compressing. Exported for tests. */
export function isCompressibleMimeType(type: string | null): boolean {
  if (!type) return false
  const base = type.split(';')[0].trim().toLowerCase()
  if (INCOMPRESSIBLE_EXCEPTIONS.has(base)) return false
  return COMPRESSIBLE_TYPE_RE.test(base)
}

/**
 * Turbopack and `next-swc` deserialize the full `nextConfig`, where
 * `compress` is typed as a plain boolean. Compression is purely a JS-side
 * (build/serve) concern, so the object form is collapsed to `true` when the
 * config crosses into the native bindings.
 */
export function serializeCompressForNativeBindings<
  T extends { compress?: boolean | CompressOptions },
>(config: T): T {
  return typeof config.compress === 'object'
    ? { ...config, compress: true }
    : config
}

/**
 * Creates an `http` middleware that compresses responses with the first
 * acceptable algorithm of `opts.algorithms`, streaming through Node's zlib.
 *
 * Semantics follow the `compression` package: skips already-encoded
 * responses, `Cache-Control: no-transform` bodies, `HEAD` requests, and
 * responses smaller than the threshold; always sets `Vary: Accept-Encoding`
 * when active, plus `Content-Encoding` on compressed responses.
 */
export function setupMultiEncodingCompression(
  opts: MultiEncodingCompressionOptions
) {
  const threshold = opts.threshold ?? 1024
  const candidates = opts.algorithms

  return function multiEncodingCompression(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): void {
    let ended = false
    let length: number | undefined
    let listeners: Array<[string, (...args: any[]) => void]> | null = []
    let stream: Duplex | null = null

    const internals = res as ServerResponseInternals

    const _end = res.end.bind(res)
    const _on = res.on.bind(res) as (
      event: string,
      listener: (...args: any[]) => void
    ) => ServerResponse
    const _write = res.write.bind(res)

    // Keep `res.flush()` from the `compression` package working.
    internals.flush = function flush() {
      if (stream) {
        ;(stream as ZlibFlushStream).flush?.()
      }
    }

    res.write = function write(chunk: any, encoding?: any) {
      if (ended) return false

      if (!internals._header) {
        internals._implicitHeader()
      }
      return stream
        ? stream.write(toBuffer(chunk, encoding))
        : _write(chunk, encoding)
    } as typeof res.write

    res.end = function end(chunk?: any, encoding?: any) {
      if (ended) return false

      if (!internals._header) {
        if (!res.getHeader('Content-Length')) {
          length = chunkLength(chunk, encoding)
        }
        internals._implicitHeader()
      }
      if (!stream) return _end(chunk, encoding)
      ended = true
      return chunk
        ? (stream.end(toBuffer(chunk, encoding)) as unknown as typeof res)
        : (stream.end() as unknown as typeof res)
    } as typeof res.end

    // The `compression` package proxies `drain` to its zlib stream (which is
    // the only handle `releaseCompressionStream()` has). Keep that contract.
    res.on = function on(type: string, listener: (...args: any[]) => void) {
      if (!listeners || type !== 'drain') {
        return _on(type, listener)
      }
      if (stream) {
        return stream.on(type, listener) as unknown as typeof res
      }
      listeners.push([type, listener])
      return res
    } as typeof res.on

    function nocompress(): void {
      if (listeners) {
        for (const [event, listener] of listeners) {
          _on(event, listener)
        }
      }
      listeners = null
    }

    onHeaders(res, function onResponseHeaders() {
      const type = res.getHeader('Content-Type')
      if (type === undefined || !isCompressibleMimeType(String(type))) {
        nocompress()
        return
      }

      // Don't compress for Cache-Control: no-transform
      // https://tools.ietf.org/html/rfc7234#section-5.2.2.4
      const cacheControl = res.getHeader('Cache-Control')
      if (
        cacheControl &&
        /(?:^|,)\s*?no-transform\s*?(?:,|$)/i.test(String(cacheControl))
      ) {
        nocompress()
        return
      }

      // vary
      addVaryHeader(res, 'Accept-Encoding')

      // content-length below threshold
      if (
        Number(res.getHeader('Content-Length')) < threshold ||
        (length !== undefined && length < threshold)
      ) {
        nocompress()
        return
      }

      const encoding = res.getHeader('Content-Encoding') || 'identity'
      // already encoded
      if (encoding !== 'identity') {
        nocompress()
        return
      }

      // head
      if (req.method === 'HEAD') {
        nocompress()
        return
      }

      const algorithm = negotiateEncoding(getAcceptEncoding(req), candidates)
      // negotiation failed
      if (!algorithm) {
        nocompress()
        return
      }

      stream = createEncoderStream(algorithm, opts)

      // add buffered listeners to stream
      if (listeners) {
        for (const [event, listener] of listeners) {
          stream.on(event, listener)
        }
      }

      // header fields
      res.setHeader('Content-Encoding', CONTENT_ENCODING_NAMES[algorithm])
      res.removeHeader('Content-Length')

      // compression
      stream.on('data', function onStreamData(chunk: Buffer) {
        if (_write(chunk) === false) {
          stream?.pause()
        }
      })

      stream.on('end', function onStreamEnd() {
        _end()
      })

      _on('drain', function onResponseDrain() {
        stream?.resume()
      })
    })

    next()
  }
}

// `zlib` streams expose a `flush()` that the compression middleware calls for
// streaming SSR; the stream type used here does not model it.
type ZlibFlushStream = Duplex & { flush?: () => void }

function createEncoderStream(
  algorithm: CompressionAlgorithm,
  opts: MultiEncodingCompressionOptions
): Duplex {
  switch (algorithm) {
    case 'gzip': {
      const options: zlib.ZlibOptions | undefined =
        opts.gzipLevel === undefined
          ? undefined
          : { level: clamp(opts.gzipLevel, 0, 9) }
      return zlib.createGzip(options)
    }
    case 'brotli': {
      const quality = clamp(opts.brotliQuality ?? 11, 0, 11)
      return zlib.createBrotliCompress({
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: quality,
        },
      })
    }
    case 'zstd': {
      const level = clamp(opts.zstdLevel ?? 3, 1, 22)
      const createZstdCompress = (zlib as ZlibWithZstd).createZstdCompress
      if (!createZstdCompress) {
        throw new Error('zstd compression is not available on this runtime')
      }
      return createZstdCompress({ level })
    }
    default: {
      // Exhaustiveness guard for the union, not for wire strings.
      const _unreachable: never = algorithm
      throw new Error(`Unsupported compression algorithm: ${_unreachable}`)
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(Math.round(value), min), max)
}

/**
 * Adapted from the `on-headers` package (MIT Licensed): invoke `listener`
 * once, synchronously, just before the response head is flushed, so the
 * middleware can decide whether to insert a zlib stream.
 */
type WriteHeadArgs = unknown[]

function onHeaders(res: ServerResponse, listener: () => void): void {
  const prevWriteHead = res.writeHead.bind(res) as (
    ...args: WriteHeadArgs
  ) => ServerResponse
  let fired = false

  res.writeHead = function writeHead(...args: WriteHeadArgs): ServerResponse {
    if (!fired) {
      fired = true
      listener()
      // The listener may have changed the status code.
      if (typeof args[0] === 'number' && res.statusCode !== args[0]) {
        args[0] = res.statusCode
        args.length = 1
      }
    }
    return prevWriteHead(...args)
  } as typeof res.writeHead
}

function addVaryHeader(res: ServerResponse, field: string): void {
  const existing = res.getHeader('Vary')
  if (existing === undefined) {
    res.setHeader('Vary', field)
    return
  }
  const fields = String(existing)
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
  if (!fields.some((f) => f.toLowerCase() === field.toLowerCase())) {
    res.setHeader('Vary', [...fields, field].join(', '))
  }
}

function chunkLength(chunk: any, encoding?: any): number {
  if (!chunk) return 0
  return !Buffer.isBuffer(chunk)
    ? Buffer.byteLength(chunk, encoding)
    : chunk.length
}

function toBuffer(chunk: any, encoding?: any): Buffer {
  return !Buffer.isBuffer(chunk) ? Buffer.from(chunk, encoding) : chunk
}
