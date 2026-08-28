import { promises } from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'
import { mediaType } from 'next/dist/compiled/@hapi/accept'
import contentDisposition from 'next/dist/compiled/content-disposition'
import { join } from 'path'
import { getImageBlurSvg } from '../shared/lib/image-blur-svg'
import type { ImageConfigComplete } from '../shared/lib/image-config'
import { hasLocalMatch } from '../shared/lib/match-local-pattern'
import { hasRemoteMatch } from '../shared/lib/match-remote-pattern'
import type { NextConfigComplete, NextConfigRuntime } from './config-shared'
import { createRequestResponseMocks } from './lib/mock-request'
import type { NextUrlWithParsedQuery } from './request-meta'
import {
  CachedRouteKind,
  IncrementalCacheKind,
  type IncrementalCacheValue,
  type IncrementalResponseCacheEntry,
} from './response-cache'
import type { CacheHandler } from './lib/incremental-cache'
import { sendEtagResponse } from './send-payload'
import { getContentType, getExtension } from './serve-static'
import * as Log from '../build/output/log'
import { isPrivateIp } from './is-private-ip'
import { getOrInitDiskLRU } from './lib/disk-lru-cache.external'
import { parseUrl, parseReqUrl } from '../lib/url'
import type { CacheControl } from './lib/cache-control'
import { InvariantError } from '../shared/lib/invariant-error'
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { ALL } from 'dns'
import {
  imageOptimizerTransform,
  type ImageUpstream,
} from './image-optimizer/transform'
import { extractEtag, getHash } from './image-optimizer/extract-etag'
import { getPreviouslyCachedImageOrNull } from './image-optimizer/get-previously-cached-image-or-null'
import { getImageSize } from './image-optimizer/get-image-size'
import { ImageError } from './image-optimizer/image-error'

// `next-server.ts` destructures `ImageError` from this module to check
// `instanceof` on errors thrown by the transform.
export { ImageError } from './image-optimizer/image-error'

type XCacheHeader = 'MISS' | 'HIT' | 'STALE'

const CACHE_VERSION = 4
const BLUR_IMG_SIZE = 8 // should match `next-image-loader`
const BLUR_QUALITY = 70 // should match `next-image-loader`

function isValidMime(contentType: string) {
  return Boolean(getExtension(contentType))
}

async function initCacheEntries(
  cacheDir: string
): Promise<Array<{ key: string; size: number; expireAt: number }>> {
  const cacheKeys = await promises.readdir(cacheDir).catch(() => [])
  const entries: Array<{ key: string; size: number; expireAt: number }> = []

  for (const cacheKey of cacheKeys) {
    try {
      const { expireAt, buffer } = await readFromCacheDir(cacheDir, cacheKey)
      entries.push({
        key: cacheKey,
        size: buffer.byteLength,
        expireAt,
      })
    } catch {
      // Skip entries that can't be read from disk
    }
  }

  // Sort oldest-first so we can replay them chronologically into LRU
  return entries.sort((a, b) => a.expireAt - b.expireAt)
}

export interface ImageParamsResult {
  href: string
  isAbsolute: boolean
  isStatic: boolean
  width: number
  quality: number
  mimeType: string
  sizes: number[]
  minimumCacheTTL: number
}

function getSupportedMimeType(options: string[], accept = ''): string {
  const mimeType = mediaType(accept, options)
  return accept.includes(mimeType) ? mimeType : ''
}

async function writeToCacheDir(
  cacheDir: string,
  cacheKey: string,
  extension: string,
  maxAge: number,
  expireAt: number,
  buffer: Buffer,
  etag: string,
  upstreamEtag: string
) {
  if (buffer.byteLength === 0) {
    throw new Error(
      'Invariant: cannot write an empty buffer to the image cache'
    )
  }

  const dir = join(/* turbopackIgnore: true */ cacheDir, cacheKey)
  const filename = join(
    /* turbopackIgnore: true */
    dir,
    `${maxAge}.${expireAt}.${etag}.${upstreamEtag}.${extension}`
  )

  await promises.rm(dir, { recursive: true, force: true }).catch(() => {})

  await promises.mkdir(dir, { recursive: true })
  await promises.writeFile(filename, buffer)
}

async function readFromCacheDir(cacheDir: string, cacheKey: string) {
  const dir = join(/* turbopackIgnore: true */ cacheDir, cacheKey)
  const files = await promises.readdir(dir)
  const file = files[0]
  if (!file) {
    throw new Error(
      `Invariant: cache entry "${cacheKey}" not found in dir "${cacheDir}"`
    )
  }
  const [maxAgeSt, expireAtSt, etag, upstreamEtag, extension] = file.split(
    '.',
    5
  )
  const filePath = join(/* turbopackIgnore: true */ dir, file)
  const buffer = await promises.readFile(/* turbopackIgnore: true */ filePath)
  if (buffer.byteLength === 0) {
    throw new Error(`Invariant: image cache entry "${cacheKey}" is empty`)
  }
  const expireAt = Number(expireAtSt)
  const maxAge = Number(maxAgeSt)
  return { maxAge, expireAt, etag, upstreamEtag, buffer, extension }
}

async function deleteFromCacheDir(cacheDir: string, cacheKey: string) {
  return promises
    .rm(join(/* turbopackIgnore: true */ cacheDir, cacheKey), {
      recursive: true,
      force: true,
    })
    .catch((err) => {
      Log.error(`Failed to delete cache key ${cacheKey}`, err)
    })
}

export class ImageOptimizerCache {
  private cacheDir: string
  private nextConfig: NextConfigRuntime
  private cacheHandler?: CacheHandler
  private cacheDiskLRU?: ReturnType<typeof getOrInitDiskLRU>
  private isDiskCacheEnabled?: boolean

  static validateParams(
    req: IncomingMessage,
    query: NextUrlWithParsedQuery['query'],
    nextConfig: NextConfigRuntime,
    isDev: boolean
  ): ImageParamsResult | { errorMessage: string } {
    const imageData = nextConfig.images
    const {
      deviceSizes = [],
      imageSizes = [],
      domains = [],
      minimumCacheTTL = 14400,
      formats = ['image/webp'],
    } = imageData
    const remotePatterns = nextConfig.images?.remotePatterns || []
    const localPatterns = nextConfig.images?.localPatterns
    const qualities = nextConfig.images?.qualities
    const { url, w, q } = query
    let href: string

    if (domains.length > 0) {
      Log.warnOnce(
        'The "images.domains" configuration is deprecated. Please use "images.remotePatterns" configuration instead.'
      )
    }

    if (!url) {
      return { errorMessage: '"url" parameter is required' }
    } else if (Array.isArray(url)) {
      return { errorMessage: '"url" parameter cannot be an array' }
    }

    if (url.length > 3072) {
      return { errorMessage: '"url" parameter is too long' }
    }

    if (url.startsWith('//')) {
      return {
        errorMessage: '"url" parameter cannot be a protocol-relative URL (//)',
      }
    }

    let isAbsolute: boolean

    if (url.startsWith('/')) {
      href = url
      isAbsolute = false
      if (
        /\/_next\/image($|\/)/.test(
          decodeURIComponent(parseUrl(url)?.pathname ?? '')
        )
      ) {
        return {
          errorMessage: '"url" parameter cannot be recursive',
        }
      }
      if (!hasLocalMatch(localPatterns, url)) {
        return { errorMessage: '"url" parameter is not allowed' }
      }
    } else {
      let hrefParsed: URL

      try {
        hrefParsed = new URL(url)
        href = hrefParsed.toString()
        isAbsolute = true
      } catch (_error) {
        return { errorMessage: '"url" parameter is invalid' }
      }

      if (!['http:', 'https:'].includes(hrefParsed.protocol)) {
        return { errorMessage: '"url" parameter is invalid' }
      }

      if (!hasRemoteMatch(domains, remotePatterns, hrefParsed)) {
        return { errorMessage: '"url" parameter is not allowed' }
      }
    }

    if (!w) {
      return { errorMessage: '"w" parameter (width) is required' }
    } else if (Array.isArray(w)) {
      return { errorMessage: '"w" parameter (width) cannot be an array' }
    } else if (!/^[0-9]+$/.test(w)) {
      return {
        errorMessage: '"w" parameter (width) must be an integer greater than 0',
      }
    }

    if (!q) {
      return { errorMessage: '"q" parameter (quality) is required' }
    } else if (Array.isArray(q)) {
      return { errorMessage: '"q" parameter (quality) cannot be an array' }
    } else if (!/^[0-9]+$/.test(q)) {
      return {
        errorMessage:
          '"q" parameter (quality) must be an integer between 1 and 100',
      }
    }

    const width = parseInt(w, 10)

    if (width <= 0 || isNaN(width)) {
      return {
        errorMessage: '"w" parameter (width) must be an integer greater than 0',
      }
    }

    const sizes = [...(deviceSizes || []), ...(imageSizes || [])]

    if (isDev) {
      sizes.push(BLUR_IMG_SIZE)
    }

    const isValidSize =
      sizes.includes(width) || (isDev && width <= BLUR_IMG_SIZE)

    if (!isValidSize) {
      return {
        errorMessage: `"w" parameter (width) of ${width} is not allowed`,
      }
    }

    const quality = parseInt(q, 10)

    if (isNaN(quality) || quality < 1 || quality > 100) {
      return {
        errorMessage:
          '"q" parameter (quality) must be an integer between 1 and 100',
      }
    }

    if (qualities) {
      if (isDev) {
        qualities.push(BLUR_QUALITY)
      }

      if (!qualities.includes(quality)) {
        return {
          errorMessage: `"q" parameter (quality) of ${q} is not allowed`,
        }
      }
    }

    const mimeType = getSupportedMimeType(formats || [], req.headers['accept'])

    const isStatic =
      url.startsWith(`${nextConfig.basePath || ''}/_next/static/media`) ||
      url.startsWith(
        `${nextConfig.basePath || ''}/_next/static/immutable/media`
      )

    return {
      href,
      sizes,
      isAbsolute,
      isStatic,
      width,
      quality,
      mimeType,
      minimumCacheTTL,
    }
  }

  static getCacheKey({
    href,
    width,
    quality,
    mimeType,
  }: {
    href: string
    width: number
    quality: number
    mimeType: string
  }): string {
    return getHash([CACHE_VERSION, href, width, quality, mimeType])
  }

  constructor({
    distDir,
    nextConfig,
    cacheHandler,
  }: {
    distDir: string
    nextConfig: NextConfigRuntime
    cacheHandler?: CacheHandler
  }) {
    this.cacheDir = join(/* turbopackIgnore: true */ distDir, 'cache', 'images')
    this.nextConfig = nextConfig
    this.cacheHandler = cacheHandler

    // Eagerly start LRU initialization for filesystem cache
    if (
      !cacheHandler &&
      nextConfig.images.maximumDiskCacheSize !== 0 &&
      nextConfig.experimental.isrFlushToDisk
    ) {
      this.isDiskCacheEnabled = true
      this.cacheDiskLRU = getOrInitDiskLRU(
        this.cacheDir,
        nextConfig.images.maximumDiskCacheSize,
        initCacheEntries,
        deleteFromCacheDir
      )
    }
  }

  async get(cacheKey: string): Promise<IncrementalResponseCacheEntry | null> {
    // If a custom cache handler is provided, use it
    if (this.cacheHandler) {
      try {
        const cacheData = await this.cacheHandler.get(cacheKey, {
          kind: IncrementalCacheKind.IMAGE,
          isFallback: false,
        })

        if (!cacheData?.value) {
          return null
        }

        if (cacheData.value.kind !== CachedRouteKind.IMAGE) {
          return null
        }

        const now = Date.now()
        const lastModified = cacheData.lastModified || now
        const revalidate =
          typeof cacheData.value.revalidate === 'number'
            ? cacheData.value.revalidate
            : this.nextConfig.images.minimumCacheTTL
        const revalidateAfter =
          Math.max(revalidate, this.nextConfig.images.minimumCacheTTL) * 1000 +
          lastModified
        const isStale = revalidateAfter < now

        return {
          value: cacheData.value,
          revalidateAfter,
          cacheControl: { revalidate, expire: undefined },
          isStale,
        }
      } catch (_) {
        // failed to get from custom cache handler, treat as cache miss
      }
      return null
    }

    // If the filesystem cache is disabled, return early
    if (!this.isDiskCacheEnabled) {
      return null
    }

    // Fall back to filesystem cache
    try {
      const now = Date.now()
      const { maxAge, expireAt, etag, upstreamEtag, buffer, extension } =
        await readFromCacheDir(this.cacheDir, cacheKey)

      // Promote entry in LRU (mark as recently used)
      const lru = await this.cacheDiskLRU
      lru?.get(cacheKey)

      return {
        value: {
          kind: CachedRouteKind.IMAGE,
          etag,
          buffer,
          extension,
          upstreamEtag,
        },
        revalidateAfter:
          Math.max(maxAge, this.nextConfig.images.minimumCacheTTL) * 1000 +
          Date.now(),
        cacheControl: { revalidate: maxAge, expire: undefined },
        isStale: now > expireAt,
      }
    } catch (_) {
      // failed to read from cache dir, treat as cache miss
    }
    return null
  }
  async set(
    cacheKey: string,
    value: IncrementalCacheValue | null,
    {
      cacheControl,
    }: {
      cacheControl?: CacheControl
    }
  ) {
    if (value?.kind !== CachedRouteKind.IMAGE) {
      throw new Error('invariant attempted to set non-image to image-cache')
    }

    const revalidate = cacheControl?.revalidate

    if (typeof revalidate !== 'number') {
      throw new InvariantError('revalidate must be a number for image-cache')
    }

    // If a custom cache handler is provided, use it
    if (this.cacheHandler) {
      try {
        // Apply minimumCacheTTL at write time, similar to the implementation in the fallback filesystem cache
        const effectiveRevalidate = Math.max(
          revalidate,
          this.nextConfig.images.minimumCacheTTL
        )
        const valueWithRevalidate = {
          ...value,
          revalidate: effectiveRevalidate,
        }
        await this.cacheHandler.set(cacheKey, valueWithRevalidate, {
          cacheControl: {
            revalidate: effectiveRevalidate,
            expire: cacheControl?.expire,
          },
        })
      } catch (err) {
        Log.error(`Failed to write image to custom cache ${cacheKey}`, err)
      }
      return
    }

    // If the filesystem cache is disabled, return early
    if (!this.isDiskCacheEnabled) {
      return
    }

    // Fall back to filesystem cache
    const expireAt =
      Math.max(revalidate, this.nextConfig.images.minimumCacheTTL) * 1000 +
      Date.now()

    try {
      const lru = await this.cacheDiskLRU
      const success = lru?.set(cacheKey, value.buffer.byteLength)
      if (success === false) {
        throw new Error(
          `image of size ${value.buffer.byteLength} could not be tracked by lru cache`
        )
      }

      await writeToCacheDir(
        this.cacheDir,
        cacheKey,
        value.extension,
        revalidate,
        expireAt,
        value.buffer,
        value.etag,
        value.upstreamEtag
      )
    } catch (err) {
      Log.error(`Failed to write image to cache ${cacheKey}`, err)
    }
  }
}
function isRedirect(statusCode: number) {
  return [301, 302, 303, 307, 308].includes(statusCode)
}

export async function fetchExternalImage(
  href: string,
  dangerouslyAllowLocalIP: boolean,
  maximumResponseBody: number,
  count = 3
): Promise<ImageUpstream> {
  if (!dangerouslyAllowLocalIP) {
    const { hostname } = new URL(href)
    let ips = [hostname]
    if (!isIP(hostname)) {
      const records = await lookup(hostname, {
        family: 0,
        all: true,
        hints: ALL,
      }).catch((_) => [{ address: hostname }])
      ips = records.map((record) => record.address)
    }
    const privateIps = ips.filter((ip) => isPrivateIp(ip))
    if (privateIps.length > 0) {
      Log.error(
        'upstream image',
        href,
        'hostname resolved to private IP',
        JSON.stringify(privateIps),
        'If this is expected and you understand SSRF risk, use images.dangerouslyAllowLocalIP = true to continue.'
      )
      throw new ImageError(400, '"url" parameter is not allowed')
    }
  }
  const res = await fetch(href, {
    signal: AbortSignal.timeout(7_000),
    redirect: 'manual',
  }).catch((err) => err as Error)

  if (res instanceof Error) {
    const err = res as Error
    if (err.name === 'TimeoutError') {
      Log.error('upstream image response timed out for', href)
      throw new ImageError(
        504,
        '"url" parameter is valid but upstream response timed out'
      )
    }
    throw err
  }

  const locationHeader = res.headers.get('Location')
  if (
    isRedirect(res.status) &&
    locationHeader &&
    URL.canParse(locationHeader, href)
  ) {
    if (count === 0) {
      Log.error('upstream image response had too many redirects', href)
      throw new ImageError(
        508,
        '"url" parameter is valid but upstream response is invalid'
      )
    }
    const redirect = new URL(locationHeader, href).href
    return fetchExternalImage(
      redirect,
      dangerouslyAllowLocalIP,
      maximumResponseBody,
      count - 1
    )
  }

  if (!res.ok) {
    Log.error('upstream image response failed for', href, res.status)
    throw new ImageError(
      res.status,
      '"url" parameter is valid but upstream response is invalid'
    )
  }

  if (!res.body) {
    Log.error('upstream image response is empty for', href)
    throw new ImageError(
      400,
      '"url" parameter is valid but upstream response is invalid'
    )
  }

  const chunks: Buffer[] = []
  let totalSize = 0

  for await (const c of res.body) {
    const chunk = Buffer.from(c)
    totalSize += chunk.byteLength
    if (totalSize > maximumResponseBody) {
      Log.error(
        'upstream image response exceeded maximum size for',
        href,
        totalSize
      )
      throw new ImageError(
        413,
        '"url" parameter is valid but upstream response is invalid'
      )
    }
    chunks.push(chunk)
  }

  const buffer = Buffer.concat(chunks)
  const contentType = res.headers.get('Content-Type')
  const cacheControl = res.headers.get('Cache-Control')
  const etag = extractEtag(res.headers.get('ETag'), buffer)
  return { buffer, contentType, cacheControl, etag }
}

export async function fetchInternalImage(
  href: string,
  _req: IncomingMessage,
  _res: ServerResponse,
  maximumResponseBody: number,
  handleRequest: (
    newReq: IncomingMessage,
    newRes: ServerResponse,
    newParsedUrl?: NextUrlWithParsedQuery
  ) => Promise<void>
): Promise<ImageUpstream> {
  try {
    // Coerce HEAD to GET to avoid issues with the image optimizer
    const method = !_req.method || _req.method === 'HEAD' ? 'GET' : _req.method

    const mocked = createRequestResponseMocks({
      url: href,
      method,
      socket: _req.socket,
      maximumResponseBody,
    })

    await handleRequest(mocked.req, mocked.res, parseReqUrl(href))
    await mocked.res.hasStreamed

    if (
      !mocked.res.statusCode ||
      mocked.res.statusCode < 200 ||
      mocked.res.statusCode > 299
    ) {
      Log.error(
        'internal image response failed for',
        href,
        mocked.res.statusCode
      )
      throw new ImageError(
        mocked.res.statusCode,
        '"url" parameter is valid but internal response is invalid'
      )
    }

    if (mocked.res.buffers.length === 0) {
      Log.error('internal image response is empty for', href)
      throw new ImageError(
        400,
        '"url" parameter is valid but internal response is invalid'
      )
    }

    const buffer = Buffer.concat(mocked.res.buffers)
    const contentType = mocked.res.getHeader('Content-Type')
    const cacheControl = mocked.res.getHeader('Cache-Control')
    const etag = extractEtag(mocked.res.getHeader('ETag'), buffer)

    return { buffer, contentType, cacheControl, etag }
  } catch (err) {
    if (err instanceof ImageError) {
      throw err
    }

    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      err.code === 'ERR_MAX_BODY_SIZE_EXCEEDED'
    ) {
      Log.error('internal image response exceeded maximum size for', href)
      throw new ImageError(
        413,
        '"url" parameter is valid but internal response is invalid'
      )
    }

    Log.error('upstream image response failed for', href, err)
    throw new ImageError(
      500,
      '"url" parameter is valid but upstream response is invalid'
    )
  }
}

async function makeBlurPlaceholder(buffer: Buffer, contentType: string) {
  // During `next dev`, we don't want to generate blur placeholders with webpack
  // because it can delay starting the dev server. Instead, `next-image-loader.js`
  // will inline a special url to lazily generate the blur placeholder at request time.
  const meta = await getImageSize(buffer)
  const blurOpts = {
    blurWidth: meta.width,
    blurHeight: meta.height,
    blurDataURL: `data:${contentType};base64,${buffer.toString('base64')}`,
  }
  return {
    buffer: Buffer.from(unescape(getImageBlurSvg(blurOpts))),
    contentType: 'image/svg+xml',
  }
}

export async function imageOptimizer(
  imageUpstream: ImageUpstream,
  paramsResult: Pick<
    ImageParamsResult,
    'href' | 'width' | 'quality' | 'mimeType'
  >,
  nextConfig: {
    experimental: Pick<
      NextConfigComplete['experimental'],
      | 'imgOptConcurrency'
      | 'imgOptOperationCache'
      | 'imgOptMaxInputPixels'
      | 'imgOptSequentialRead'
      | 'imgOptTimeoutInSeconds'
    >
    images: Pick<
      NextConfigComplete['images'],
      'dangerouslyAllowSVG' | 'minimumCacheTTL'
    >
  },
  opts: {
    isDev?: boolean
    silent?: boolean
    previousCacheEntry?: IncrementalResponseCacheEntry | null
  }
): Promise<{
  buffer: Buffer
  contentType: string
  maxAge: number
  etag: string
  upstreamEtag: string
  error?: unknown
}> {
  const previouslyCachedImage = getPreviouslyCachedImageOrNull(
    imageUpstream,
    opts.previousCacheEntry
  )

  return imageOptimizerTransform(imageUpstream, paramsResult, nextConfig, {
    isValidMime,
    previousOutput: previouslyCachedImage
      ? {
          buffer: previouslyCachedImage.buffer,
          maxAge:
            opts.previousCacheEntry?.cacheControl?.revalidate || undefined,
          etag: previouslyCachedImage.etag,
          upstreamEtag: previouslyCachedImage.upstreamEtag,
        }
      : undefined,
    logger: opts.silent ? undefined : Log,
    handleDevOutput:
      opts.isDev &&
      paramsResult.width <= BLUR_IMG_SIZE &&
      paramsResult.quality === BLUR_QUALITY
        ? makeBlurPlaceholder
        : undefined,
  })
}

function getFileNameWithExtension(
  url: string,
  contentType: string | null
): string {
  const [urlWithoutQueryParams] = url.split('?', 1)
  const fileNameWithExtension = urlWithoutQueryParams.split('/').pop()
  if (!contentType || !fileNameWithExtension) {
    return 'image.bin'
  }

  const [fileName] = fileNameWithExtension.split('.', 1)
  const extension = getExtension(contentType)
  return `${fileName}.${extension}`
}

function setResponseHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  etag: string,
  contentType: string | null,
  isStatic: boolean,
  xCache: XCacheHeader,
  imagesConfig: ImageConfigComplete,
  maxAge: number,
  isDev: boolean
) {
  res.setHeader('Vary', 'Accept')
  res.setHeader(
    'Cache-Control',
    isStatic
      ? 'public, max-age=315360000, immutable'
      : `public, max-age=${isDev ? 0 : maxAge}, must-revalidate`
  )
  if (sendEtagResponse(req, res, etag)) {
    // already called res.end() so we're finished
    return { finished: true }
  }
  if (contentType) {
    res.setHeader('Content-Type', contentType)
  }

  const fileName = getFileNameWithExtension(url, contentType)
  res.setHeader(
    'Content-Disposition',
    contentDisposition(fileName, { type: imagesConfig.contentDispositionType })
  )

  res.setHeader('Content-Security-Policy', imagesConfig.contentSecurityPolicy)
  res.setHeader('X-Nextjs-Cache', xCache)

  return { finished: false }
}

export function sendResponse(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  extension: string,
  buffer: Buffer,
  etag: string,
  isStatic: boolean,
  xCache: XCacheHeader,
  imagesConfig: ImageConfigComplete,
  maxAge: number,
  isDev: boolean
) {
  const contentType = getContentType(extension)
  const result = setResponseHeaders(
    req,
    res,
    url,
    etag,
    contentType,
    isStatic,
    xCache,
    imagesConfig,
    maxAge,
    isDev
  )
  if (!result.finished) {
    res.setHeader('Content-Length', Buffer.byteLength(buffer))
    // A response body must not be sent for HEAD requests
    if (req.method === 'HEAD') {
      res.end()
    } else {
      res.end(buffer)
    }
  }
}
