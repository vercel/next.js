import { mediaType } from 'next/dist/compiled/@hapi/accept'
import { createHash } from 'crypto'
import { promises } from 'fs'
import { getOrientation, Orientation } from 'next/dist/compiled/get-orientation'
import imageSizeOf from 'next/dist/compiled/image-size'
import { IncomingMessage, ServerResponse } from 'http'
import isAnimated from 'next/dist/compiled/is-animated'
import contentDisposition from 'next/dist/compiled/content-disposition'
import { join } from 'path'
import nodeUrl, { UrlWithParsedQuery } from 'url'
import { NextConfigComplete } from './config-shared'
import {
  processBuffer,
  decodeBuffer,
  Operation,
  getMetadata,
} from './lib/squoosh/main'
import { sendEtagResponse } from './send-payload'
import { getContentType, getExtension } from './serve-static'
import chalk from 'next/dist/compiled/chalk'
import { NextUrlWithParsedQuery } from './request-meta'
import { IncrementalCacheEntry, IncrementalCacheValue } from './response-cache'
import { mockRequest } from './lib/mock-request'
import { hasMatch } from '../shared/lib/match-remote-pattern'
import { getImageBlurSvg } from '../shared/lib/image-blur-svg'
import { ImageConfigComplete } from '../shared/lib/image-config'

type XCacheHeader = 'MISS' | 'HIT' | 'STALE'

const AVIF = 'image/avif'
const WEBP = 'image/webp'
const PNG = 'image/png'
const JPEG = 'image/jpeg'
const GIF = 'image/gif'
const SVG = 'image/svg+xml'
const CACHE_VERSION = 3
const ANIMATABLE_TYPES = [WEBP, PNG, GIF]
const VECTOR_TYPES = [SVG]
const BLUR_IMG_SIZE = 8 // should match `next-image-loader`
const BLUR_QUALITY = 70 // should match `next-image-loader`

let sharp:
  | ((
      input?: string | Buffer,
      options?: import('sharp').SharpOptions
    ) => import('sharp').Sharp)
  | undefined

try {
  sharp = require(process.env.NEXT_SHARP_PATH || 'sharp')
} catch (e) {
  // Sharp not present on the server, Squoosh fallback will be used
}

let showSharpMissingWarning = process.env.NODE_ENV === 'production'

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

export function getHash(items: (string | number | Buffer)[]) {
  const hash = createHash('sha256')
  for (let item of items) {
    if (typeof item === 'number') hash.update(String(item))
    else {
      hash.update(item)
    }
  }
  // See https://en.wikipedia.org/wiki/Base64#Filenames
  return hash.digest('base64').replace(/\//g, '-')
}

async function writeToCacheDir(
  dir: string,
  extension: string,
  maxAge: number,
  expireAt: number,
  buffer: Buffer,
  etag: string
) {
  const filename = join(dir, `${maxAge}.${expireAt}.${etag}.${extension}`)

  // Added in: v14.14.0 https://nodejs.org/api/fs.html#fspromisesrmpath-options
  // attempt cleaning up existing stale cache
  if ((promises as any).rm) {
    await (promises as any)
      .rm(dir, { force: true, recursive: true })
      .catch(() => {})
  } else {
    await promises.rmdir(dir, { recursive: true }).catch(() => {})
  }
  await promises.mkdir(dir, { recursive: true })
  await promises.writeFile(filename, buffer)
}

/**
 * Inspects the first few bytes of a buffer to determine if
 * it matches the "magic number" of known file signatures.
 * https://en.wikipedia.org/wiki/List_of_file_signatures
 */
export function detectContentType(buffer: Buffer) {
  if ([0xff, 0xd8, 0xff].every((b, i) => buffer[i] === b)) {
    return JPEG
  }
  if (
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (b, i) => buffer[i] === b
    )
  ) {
    return PNG
  }
  if ([0x47, 0x49, 0x46, 0x38].every((b, i) => buffer[i] === b)) {
    return GIF
  }
  if (
    [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50].every(
      (b, i) => !b || buffer[i] === b
    )
  ) {
    return WEBP
  }
  if ([0x3c, 0x3f, 0x78, 0x6d, 0x6c].every((b, i) => buffer[i] === b)) {
    return SVG
  }
  if (
    [0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66].every(
      (b, i) => !b || buffer[i] === b
    )
  ) {
    return AVIF
  }
  return null
}

export class ImageOptimizerCache {
  private cacheDir: string
  private nextConfig: NextConfigComplete

  static validateParams(
    req: IncomingMessage,
    query: UrlWithParsedQuery['query'],
    nextConfig: NextConfigComplete,
    isDev: boolean
  ): ImageParamsResult | { errorMessage: string } {
    const imageData = nextConfig.images
    const {
      deviceSizes = [],
      imageSizes = [],
      domains = [],
      minimumCacheTTL = 60,
      formats = ['image/webp'],
    } = imageData
    const remotePatterns = nextConfig.images?.remotePatterns || []
    const { url, w, q } = query
    let href: string

    if (!url) {
      return { errorMessage: '"url" parameter is required' }
    } else if (Array.isArray(url)) {
      return { errorMessage: '"url" parameter cannot be an array' }
    }

    let isAbsolute: boolean

    if (url.startsWith('/')) {
      href = url
      isAbsolute = false
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

      if (!hasMatch(domains, remotePatterns, hrefParsed)) {
        return { errorMessage: '"url" parameter is not allowed' }
      }
    }

    if (!w) {
      return { errorMessage: '"w" parameter (width) is required' }
    } else if (Array.isArray(w)) {
      return { errorMessage: '"w" parameter (width) cannot be an array' }
    }

    if (!q) {
      return { errorMessage: '"q" parameter (quality) is required' }
    } else if (Array.isArray(q)) {
      return { errorMessage: '"q" parameter (quality) cannot be an array' }
    }

    const width = parseInt(w, 10)

    if (width <= 0 || isNaN(width)) {
      return {
        errorMessage: '"w" parameter (width) must be a number greater than 0',
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

    const quality = parseInt(q)

    if (isNaN(quality) || quality < 1 || quality > 100) {
      return {
        errorMessage:
          '"q" parameter (quality) must be a number between 1 and 100',
      }
    }

    const mimeType = getSupportedMimeType(formats || [], req.headers['accept'])

    const isStatic = url.startsWith(
      `${nextConfig.basePath || ''}/_next/static/media`
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
  }: {
    distDir: string
    nextConfig: NextConfigComplete
  }) {
    this.cacheDir = join(distDir, 'cache', 'images')
    this.nextConfig = nextConfig
  }

  async get(cacheKey: string): Promise<IncrementalCacheEntry | null> {
    try {
      const cacheDir = join(this.cacheDir, cacheKey)
      const files = await promises.readdir(cacheDir)
      const now = Date.now()

      for (const file of files) {
        const [maxAgeSt, expireAtSt, etag, extension] = file.split('.')
        const buffer = await promises.readFile(join(cacheDir, file))
        const expireAt = Number(expireAtSt)
        const maxAge = Number(maxAgeSt)

        return {
          value: {
            kind: 'IMAGE',
            etag,
            buffer,
            extension,
          },
          revalidateAfter:
            Math.max(maxAge, this.nextConfig.images.minimumCacheTTL) * 1000 +
            Date.now(),
          curRevalidate: maxAge,
          isStale: now > expireAt,
        }
      }
    } catch (_) {
      // failed to read from cache dir, treat as cache miss
    }
    return null
  }
  async set(
    cacheKey: string,
    value: IncrementalCacheValue | null,
    revalidate?: number | false
  ) {
    if (value?.kind !== 'IMAGE') {
      throw new Error('invariant attempted to set non-image to image-cache')
    }

    if (typeof revalidate !== 'number') {
      throw new Error('invariant revalidate must be a number for image-cache')
    }
    const expireAt =
      Math.max(revalidate, this.nextConfig.images.minimumCacheTTL) * 1000 +
      Date.now()

    try {
      await writeToCacheDir(
        join(this.cacheDir, cacheKey),
        value.extension,
        revalidate,
        expireAt,
        value.buffer,
        value.etag
      )
    } catch (err) {
      console.error(`Failed to write image to cache ${cacheKey}`, err)
    }
  }
}
export class ImageError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)

    // ensure an error status is used > 400
    if (statusCode >= 400) {
      this.statusCode = statusCode
    } else {
      this.statusCode = 500
    }
  }
}

function parseCacheControl(str: string | null): Map<string, string> {
  const map = new Map<string, string>()
  if (!str) {
    return map
  }
  for (let directive of str.split(',')) {
    let [key, value] = directive.trim().split('=')
    key = key.toLowerCase()
    if (value) {
      value = value.toLowerCase()
    }
    map.set(key, value)
  }
  return map
}

export function getMaxAge(str: string | null): number {
  const map = parseCacheControl(str)
  if (map) {
    let age = map.get('s-maxage') || map.get('max-age') || ''
    if (age.startsWith('"') && age.endsWith('"')) {
      age = age.slice(1, -1)
    }
    const n = parseInt(age, 10)
    if (!isNaN(n)) {
      return n
    }
  }
  return 0
}

export async function optimizeImage({
  buffer,
  contentType,
  quality,
  width,
  height,
  nextConfigOutput,
}: {
  buffer: Buffer
  contentType: string
  quality: number
  width: number
  height?: number
  nextConfigOutput?: 'standalone'
}): Promise<Buffer> {
  let optimizedBuffer = buffer
  if (sharp) {
    // Begin sharp transformation logic
    const transformer = sharp(buffer, {
      sequentialRead: true,
    })

    transformer.rotate()

    if (height) {
      transformer.resize(width, height)
    } else {
      transformer.resize(width, undefined, {
        withoutEnlargement: true,
      })
    }

    if (contentType === AVIF) {
      if (transformer.avif) {
        const avifQuality = quality - 15
        transformer.avif({
          quality: Math.max(avifQuality, 0),
          chromaSubsampling: '4:2:0', // same as webp
        })
      } else {
        console.warn(
          chalk.yellow.bold('Warning: ') +
            `Your installed version of the 'sharp' package does not support AVIF images. Run 'yarn add sharp@latest' to upgrade to the latest version.\n` +
            'Read more: https://nextjs.org/docs/messages/sharp-version-avif'
        )
        transformer.webp({ quality })
      }
    } else if (contentType === WEBP) {
      transformer.webp({ quality })
    } else if (contentType === PNG) {
      transformer.png({ quality })
    } else if (contentType === JPEG) {
      transformer.jpeg({ quality })
    }

    optimizedBuffer = await transformer.toBuffer()
    // End sharp transformation logic
  } else {
    if (showSharpMissingWarning && nextConfigOutput) {
      // TODO: should we ensure squoosh also works even though we don't
      // recommend it be used in production and this is a production feature
      console.error(
        `Error: 'sharp' is required to be installed in standalone mode for the image optimization to function correctly. Read more at: https://nextjs.org/docs/messages/sharp-missing-in-production`
      )
      throw new ImageError(500, 'internal server error')
    }
    // Show sharp warning in production once
    if (showSharpMissingWarning) {
      console.warn(
        chalk.yellow.bold('Warning: ') +
          `For production Image Optimization with Next.js, the optional 'sharp' package is strongly recommended. Run 'yarn add sharp', and Next.js will use it automatically for Image Optimization.\n` +
          'Read more: https://nextjs.org/docs/messages/sharp-missing-in-production'
      )
      showSharpMissingWarning = false
    }

    // Begin Squoosh transformation logic
    const orientation = await getOrientation(buffer)

    const operations: Operation[] = []

    if (orientation === Orientation.RIGHT_TOP) {
      operations.push({ type: 'rotate', numRotations: 1 })
    } else if (orientation === Orientation.BOTTOM_RIGHT) {
      operations.push({ type: 'rotate', numRotations: 2 })
    } else if (orientation === Orientation.LEFT_BOTTOM) {
      operations.push({ type: 'rotate', numRotations: 3 })
    } else {
      // TODO: support more orientations
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      // const _: never = orientation
    }

    if (height) {
      operations.push({ type: 'resize', width, height })
    } else {
      operations.push({ type: 'resize', width })
    }

    if (contentType === AVIF) {
      optimizedBuffer = await processBuffer(buffer, operations, 'avif', quality)
    } else if (contentType === WEBP) {
      optimizedBuffer = await processBuffer(buffer, operations, 'webp', quality)
    } else if (contentType === PNG) {
      optimizedBuffer = await processBuffer(buffer, operations, 'png', quality)
    } else if (contentType === JPEG) {
      optimizedBuffer = await processBuffer(buffer, operations, 'jpeg', quality)
    }
  }

  return optimizedBuffer
}

export async function imageOptimizer(
  _req: IncomingMessage,
  _res: ServerResponse,
  paramsResult: ImageParamsResult,
  nextConfig: NextConfigComplete,
  isDev: boolean | undefined,
  handleRequest: (
    newReq: IncomingMessage,
    newRes: ServerResponse,
    newParsedUrl?: NextUrlWithParsedQuery
  ) => Promise<void>
): Promise<{ buffer: Buffer; contentType: string; maxAge: number }> {
  let upstreamBuffer: Buffer
  let upstreamType: string | null
  let maxAge: number
  const { isAbsolute, href, width, mimeType, quality } = paramsResult

  if (isAbsolute) {
    const upstreamRes = await fetch(href)

    if (!upstreamRes.ok) {
      console.error(
        'upstream image response failed for',
        href,
        upstreamRes.status
      )
      throw new ImageError(
        upstreamRes.status,
        '"url" parameter is valid but upstream response is invalid'
      )
    }

    upstreamBuffer = Buffer.from(await upstreamRes.arrayBuffer())
    upstreamType =
      detectContentType(upstreamBuffer) ||
      upstreamRes.headers.get('Content-Type')
    maxAge = getMaxAge(upstreamRes.headers.get('Cache-Control'))
  } else {
    try {
      const {
        resBuffers,
        req: mockReq,
        res: mockRes,
        streamPromise: isStreamFinished,
      } = mockRequest(href, _req.headers, _req.method || 'GET', _req.connection)

      await handleRequest(mockReq, mockRes, nodeUrl.parse(href, true))
      await isStreamFinished

      if (!mockRes.statusCode) {
        console.error('image response failed for', href, mockRes.statusCode)
        throw new ImageError(
          mockRes.statusCode,
          '"url" parameter is valid but internal response is invalid'
        )
      }

      upstreamBuffer = Buffer.concat(resBuffers)
      upstreamType =
        detectContentType(upstreamBuffer) || mockRes.getHeader('Content-Type')
      maxAge = getMaxAge(mockRes.getHeader('Cache-Control'))
    } catch (err) {
      console.error('upstream image response failed for', href, err)
      throw new ImageError(
        500,
        '"url" parameter is valid but upstream response is invalid'
      )
    }
  }

  if (upstreamType) {
    upstreamType = upstreamType.toLowerCase().trim()

    if (
      upstreamType.startsWith('image/svg') &&
      !nextConfig.images.dangerouslyAllowSVG
    ) {
      console.error(
        `The requested resource "${href}" has type "${upstreamType}" but dangerouslyAllowSVG is disabled`
      )
      throw new ImageError(
        400,
        '"url" parameter is valid but image type is not allowed'
      )
    }
    const vector = VECTOR_TYPES.includes(upstreamType)
    const animate =
      ANIMATABLE_TYPES.includes(upstreamType) && isAnimated(upstreamBuffer)

    if (vector || animate) {
      return { buffer: upstreamBuffer, contentType: upstreamType, maxAge }
    }
    if (!upstreamType.startsWith('image/') || upstreamType.includes(',')) {
      console.error(
        "The requested resource isn't a valid image for",
        href,
        'received',
        upstreamType
      )
      throw new ImageError(400, "The requested resource isn't a valid image.")
    }
  }

  let contentType: string

  if (mimeType) {
    contentType = mimeType
  } else if (
    upstreamType?.startsWith('image/') &&
    getExtension(upstreamType) &&
    upstreamType !== WEBP &&
    upstreamType !== AVIF
  ) {
    contentType = upstreamType
  } else {
    contentType = JPEG
  }
  try {
    let optimizedBuffer = await optimizeImage({
      buffer: upstreamBuffer,
      contentType,
      quality,
      width,
      nextConfigOutput: nextConfig.output,
    })
    if (optimizedBuffer) {
      if (isDev && width <= BLUR_IMG_SIZE && quality === BLUR_QUALITY) {
        // During `next dev`, we don't want to generate blur placeholders with webpack
        // because it can delay starting the dev server. Instead, `next-image-loader.js`
        // will inline a special url to lazily generate the blur placeholder at request time.
        const meta = await getMetadata(optimizedBuffer)
        const opts = {
          blurWidth: meta.width,
          blurHeight: meta.height,
          blurDataURL: `data:${contentType};base64,${optimizedBuffer.toString(
            'base64'
          )}`,
        }
        optimizedBuffer = Buffer.from(unescape(getImageBlurSvg(opts)))
        contentType = 'image/svg+xml'
      }
      return {
        buffer: optimizedBuffer,
        contentType,
        maxAge: Math.max(maxAge, nextConfig.images.minimumCacheTTL),
      }
    } else {
      throw new ImageError(500, 'Unable to optimize buffer')
    }
  } catch (error) {
    if (upstreamBuffer && upstreamType) {
      // If we fail to optimize, fallback to the original image
      return {
        buffer: upstreamBuffer,
        contentType: upstreamType,
        maxAge: nextConfig.images.minimumCacheTTL,
      }
    } else {
      throw new ImageError(
        400,
        'Unable to optimize image and unable to fallback to upstream image'
      )
    }
  }
}

function getFileNameWithExtension(
  url: string,
  contentType: string | null
): string {
  const [urlWithoutQueryParams] = url.split('?')
  const fileNameWithExtension = urlWithoutQueryParams.split('/').pop()
  if (!contentType || !fileNameWithExtension) {
    return 'image.bin'
  }

  const [fileName] = fileNameWithExtension.split('.')
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
  isStatic: boolean,
  xCache: XCacheHeader,
  imagesConfig: ImageConfigComplete,
  maxAge: number,
  isDev: boolean
) {
  const contentType = getContentType(extension)
  const etag = getHash([buffer])
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
    res.end(buffer)
  }
}

export async function getImageSize(
  buffer: Buffer,
  // Should match VALID_BLUR_EXT
  extension: 'avif' | 'webp' | 'png' | 'jpeg'
): Promise<{
  width?: number
  height?: number
}> {
  // TODO: upgrade "image-size" package to support AVIF
  // See https://github.com/image-size/image-size/issues/348
  if (extension === 'avif') {
    if (sharp) {
      const transformer = sharp(buffer)
      const { width, height } = await transformer.metadata()
      return { width, height }
    } else {
      const { width, height } = await decodeBuffer(buffer)
      return { width, height }
    }
  }

  const { width, height } = imageSizeOf(buffer)
  return { width, height }
}

export class Deferred<T> {
  promise: Promise<T>
  resolve!: (value: T) => void
  reject!: (error?: Error) => void

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}
