import { mediaType } from 'next/dist/compiled/@hapi/accept'
import { createHash } from 'crypto'
import { promises } from 'fs'
import { getOrientation, Orientation } from 'next/dist/compiled/get-orientation'
import imageSizeOf from 'next/dist/compiled/image-size'
import { IncomingMessage, ServerResponse } from 'http'
// @ts-ignore no types for is-animated
import isAnimated from 'next/dist/compiled/is-animated'
import contentDisposition from 'next/dist/compiled/content-disposition'
import { join } from 'path'
import Stream from 'stream'
import nodeUrl, { UrlWithParsedQuery } from 'url'
import { NextConfig } from './config-shared'
import { ImageConfig, imageConfigDefault } from './image-config'
import { processBuffer, decodeBuffer, Operation } from './lib/squoosh/main'
import { sendEtagResponse } from './send-payload'
import { getContentType, getExtension } from './serve-static'
import chalk from 'next/dist/compiled/chalk'
import { NextUrlWithParsedQuery } from './request-meta'

type XCacheHeader = 'MISS' | 'HIT' | 'STALE'
type Inflight = { buffer: Buffer; filename: string }
type FileMetadata = {
  filename: string
  maxAge: number
  expireAt: number
  etag: string
  contentType: string | null
}

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
const inflightRequests = new Map<string, Promise<Inflight | null>>()

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

export async function imageOptimizer(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: UrlWithParsedQuery,
  nextConfig: NextConfig,
  distDir: string,
  render404: () => Promise<void>,
  handleRequest: (
    newReq: IncomingMessage,
    newRes: ServerResponse,
    newParsedUrl?: NextUrlWithParsedQuery
  ) => Promise<void>,
  isDev = false
) {
  const imageData: ImageConfig = nextConfig.images || imageConfigDefault
  const {
    deviceSizes = [],
    imageSizes = [],
    domains = [],
    loader,
    minimumCacheTTL = 60,
    formats = ['image/webp'],
  } = imageData

  if (loader !== 'default') {
    await render404()
    return { finished: true }
  }

  const { headers } = req
  const { url, w, q } = parsedUrl.query
  const mimeType = getSupportedMimeType(formats, headers.accept)
  let href: string

  if (!url) {
    res.statusCode = 400
    res.end('"url" parameter is required')
    return { finished: true }
  } else if (Array.isArray(url)) {
    res.statusCode = 400
    res.end('"url" parameter cannot be an array')
    return { finished: true }
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
      res.statusCode = 400
      res.end('"url" parameter is invalid')
      return { finished: true }
    }

    if (!['http:', 'https:'].includes(hrefParsed.protocol)) {
      res.statusCode = 400
      res.end('"url" parameter is invalid')
      return { finished: true }
    }

    if (!domains.includes(hrefParsed.hostname)) {
      res.statusCode = 400
      res.end('"url" parameter is not allowed')
      return { finished: true }
    }
  }

  if (!w) {
    res.statusCode = 400
    res.end('"w" parameter (width) is required')
    return { finished: true }
  } else if (Array.isArray(w)) {
    res.statusCode = 400
    res.end('"w" parameter (width) cannot be an array')
    return { finished: true }
  }

  if (!q) {
    res.statusCode = 400
    res.end('"q" parameter (quality) is required')
    return { finished: true }
  } else if (Array.isArray(q)) {
    res.statusCode = 400
    res.end('"q" parameter (quality) cannot be an array')
    return { finished: true }
  }

  // Should match output from next-image-loader
  const isStatic = url.startsWith(
    `${nextConfig.basePath || ''}/_next/static/media`
  )

  const width = parseInt(w, 10)

  if (!width || isNaN(width)) {
    res.statusCode = 400
    res.end('"w" parameter (width) must be a number greater than 0')
    return { finished: true }
  }

  const sizes = [...deviceSizes, ...imageSizes]

  if (isDev) {
    sizes.push(BLUR_IMG_SIZE)
  }

  if (!sizes.includes(width)) {
    res.statusCode = 400
    res.end(`"w" parameter (width) of ${width} is not allowed`)
    return { finished: true }
  }

  const quality = parseInt(q)

  if (isNaN(quality) || quality < 1 || quality > 100) {
    res.statusCode = 400
    res.end('"q" parameter (quality) must be a number between 1 and 100')
    return { finished: true }
  }

  const hash = getHash([CACHE_VERSION, href, width, quality, mimeType])
  const imagesDir = join(distDir, 'cache', 'images')
  const hashDir = join(imagesDir, hash)
  const previousInflight = inflightRequests.get(hashDir)
  let xCache: XCacheHeader = 'MISS'
  let sendDedupe = { sent: false }

  // If there are concurrent requests hitting the same STALE resource,
  // we can serve it from memory to avoid blocking below.
  if (previousInflight && (await previousInflight)) {
    const now = Date.now()
    const { filename, buffer } = (await previousInflight)!
    const { maxAge, expireAt, etag, contentType } = getFileMetadata(filename)
    xCache = now < expireAt ? 'HIT' : 'STALE'
    await sendResponse(
      sendDedupe,
      req,
      res,
      url,
      maxAge,
      contentType,
      buffer,
      isStatic,
      isDev,
      xCache,
      etag
    )
    return { finished: true }
  }

  const currentInflight = new Deferred<Inflight | null>()
  inflightRequests.set(hashDir, currentInflight.promise)

  try {
    const now = Date.now()
    const freshFiles = []
    const staleFiles = []
    let cachedFile: FileMetadata | undefined
    const files = (await promises.readdir(hashDir).catch(() => {})) || []

    for (let filename of files) {
      const meta = getFileMetadata(filename)
      if (now < meta.expireAt) {
        freshFiles.push(meta)
      } else {
        staleFiles.push(meta)
      }
    }

    if (freshFiles.length > 0) {
      cachedFile = freshFiles[0]
      xCache = 'HIT'
    } else if (staleFiles.length > 0) {
      cachedFile = staleFiles[0]
      xCache = 'STALE'
    } else {
      xCache = 'MISS'
    }

    if (cachedFile) {
      const { filename, maxAge, etag, contentType } = cachedFile
      const buffer = await promises.readFile(join(hashDir, filename))
      await sendResponse(
        sendDedupe,
        req,
        res,
        url,
        maxAge,
        contentType,
        buffer,
        isStatic,
        isDev,
        xCache,
        etag
      )
      for (let stale of staleFiles) {
        await promises.unlink(join(hashDir, stale.filename))
      }
      currentInflight.resolve({ filename, buffer })
      if (xCache === 'HIT') {
        return { finished: true }
      }
    }

    let upstreamBuffer: Buffer
    let upstreamType: string | null
    let maxAge: number

    if (isAbsolute) {
      const upstreamRes = await fetch(href)

      if (!upstreamRes.ok) {
        res.statusCode = upstreamRes.status
        res.end('"url" parameter is valid but upstream response is invalid')
        return { finished: true }
      }

      res.statusCode = upstreamRes.status
      upstreamBuffer = Buffer.from(await upstreamRes.arrayBuffer())
      upstreamType =
        detectContentType(upstreamBuffer) ||
        upstreamRes.headers.get('Content-Type')
      maxAge = getMaxAge(upstreamRes.headers.get('Cache-Control'))
    } else {
      try {
        const resBuffers: Buffer[] = []
        const mockRes: any = new Stream.Writable()

        const isStreamFinished = new Promise(function (resolve, reject) {
          mockRes.on('finish', () => resolve(true))
          mockRes.on('end', () => resolve(true))
          mockRes.on('error', () => reject())
        })

        mockRes.write = (chunk: Buffer | string) => {
          resBuffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        mockRes._write = (
          chunk: Buffer | string,
          _encoding: string,
          callback: () => void
        ) => {
          mockRes.write(chunk)
          // According to Node.js documentation, the callback MUST be invoked to signal that
          // the write completed successfully. If this callback is not invoked, the 'finish' event
          // will not be emitted.
          // https://nodejs.org/docs/latest-v16.x/api/stream.html#writable_writechunk-encoding-callback
          callback()
        }

        const mockHeaders: Record<string, string | string[]> = {}

        mockRes.writeHead = (_status: any, _headers: any) =>
          Object.assign(mockHeaders, _headers)
        mockRes.getHeader = (name: string) => mockHeaders[name.toLowerCase()]
        mockRes.getHeaders = () => mockHeaders
        mockRes.getHeaderNames = () => Object.keys(mockHeaders)
        mockRes.setHeader = (name: string, value: string | string[]) =>
          (mockHeaders[name.toLowerCase()] = value)
        mockRes.removeHeader = (name: string) => {
          delete mockHeaders[name.toLowerCase()]
        }
        mockRes._implicitHeader = () => {}
        mockRes.connection = res.connection
        mockRes.finished = false
        mockRes.statusCode = 200

        const mockReq: any = new Stream.Readable()

        mockReq._read = () => {
          mockReq.emit('end')
          mockReq.emit('close')
          return Buffer.from('')
        }

        mockReq.headers = req.headers
        mockReq.method = req.method
        mockReq.url = href
        mockReq.connection = req.connection

        await handleRequest(mockReq, mockRes, nodeUrl.parse(href, true))
        await isStreamFinished
        res.statusCode = mockRes.statusCode
        upstreamBuffer = Buffer.concat(resBuffers)
        upstreamType =
          detectContentType(upstreamBuffer) || mockRes.getHeader('Content-Type')
        maxAge = getMaxAge(mockRes.getHeader('Cache-Control'))
      } catch (err) {
        res.statusCode = 500
        res.end('"url" parameter is valid but upstream response is invalid')
        return { finished: true }
      }
    }

    const expireAt = Math.max(maxAge, minimumCacheTTL) * 1000 + Date.now()

    if (upstreamType) {
      const vector = VECTOR_TYPES.includes(upstreamType)
      const animate =
        ANIMATABLE_TYPES.includes(upstreamType) && isAnimated(upstreamBuffer)
      if (vector || animate) {
        await writeToCacheDir(
          hashDir,
          upstreamType,
          maxAge,
          expireAt,
          upstreamBuffer
        )
        await sendResponse(
          sendDedupe,
          req,
          res,
          url,
          maxAge,
          upstreamType,
          upstreamBuffer,
          isStatic,
          isDev,
          xCache
        )
        return { finished: true }
      }
      if (!upstreamType.startsWith('image/')) {
        res.statusCode = 400
        res.end("The requested resource isn't a valid image.")
        return { finished: true }
      }
    }

    let contentType: string

    if (mimeType) {
      contentType = mimeType
    } else if (
      upstreamType?.startsWith('image/') &&
      getExtension(upstreamType)
    ) {
      contentType = upstreamType
    } else {
      contentType = JPEG
    }
    try {
      let optimizedBuffer: Buffer | undefined
      if (sharp) {
        // Begin sharp transformation logic
        const transformer = sharp(upstreamBuffer)

        transformer.rotate()

        const { width: metaWidth } = await transformer.metadata()

        if (metaWidth && metaWidth > width) {
          transformer.resize(width)
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
        if (
          showSharpMissingWarning &&
          nextConfig.experimental?.outputStandalone
        ) {
          // TODO: should we ensure squoosh also works even though we don't
          // recommend it be used in production and this is a production feature
          console.error(
            `Error: 'sharp' is required to be installed in standalone mode for the image optimization to function correctly`
          )
          req.statusCode = 500
          res.end('internal server error')
          return { finished: true }
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
        const orientation = await getOrientation(upstreamBuffer)

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

        operations.push({ type: 'resize', width })

        if (contentType === AVIF) {
          optimizedBuffer = await processBuffer(
            upstreamBuffer,
            operations,
            'avif',
            quality
          )
        } else if (contentType === WEBP) {
          optimizedBuffer = await processBuffer(
            upstreamBuffer,
            operations,
            'webp',
            quality
          )
        } else if (contentType === PNG) {
          optimizedBuffer = await processBuffer(
            upstreamBuffer,
            operations,
            'png',
            quality
          )
        } else if (contentType === JPEG) {
          optimizedBuffer = await processBuffer(
            upstreamBuffer,
            operations,
            'jpeg',
            quality
          )
        }

        // End Squoosh transformation logic
      }
      if (optimizedBuffer) {
        await writeToCacheDir(
          hashDir,
          contentType,
          maxAge,
          expireAt,
          optimizedBuffer
        )
        await sendResponse(
          sendDedupe,
          req,
          res,
          url,
          maxAge,
          contentType,
          optimizedBuffer,
          isStatic,
          isDev,
          xCache
        )
      } else {
        throw new Error('Unable to optimize buffer')
      }
    } catch (error) {
      await sendResponse(
        sendDedupe,
        req,
        res,
        url,
        maxAge,
        upstreamType,
        upstreamBuffer,
        isStatic,
        isDev,
        xCache
      )
    }

    return { finished: true }
  } finally {
    currentInflight.resolve(null)
    inflightRequests.delete(hashDir)
  }
}

async function writeToCacheDir(
  dir: string,
  contentType: string,
  maxAge: number,
  expireAt: number,
  buffer: Buffer
) {
  await promises.mkdir(dir, { recursive: true })
  const extension = getExtension(contentType)
  const etag = getHash([buffer])
  const filename = join(dir, `${maxAge}.${expireAt}.${etag}.${extension}`)
  await promises.writeFile(filename, buffer)
  inflightRequests.delete(dir)
}

function getFileNameWithExtension(
  url: string,
  contentType: string | null
): string | void {
  const [urlWithoutQueryParams] = url.split('?')
  const fileNameWithExtension = urlWithoutQueryParams.split('/').pop()
  if (!contentType || !fileNameWithExtension) {
    return
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
  maxAge: number,
  contentType: string | null,
  isStatic: boolean,
  isDev: boolean,
  xCache: XCacheHeader
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
  if (fileName) {
    res.setHeader(
      'Content-Disposition',
      contentDisposition(fileName, { type: 'inline' })
    )
  }

  res.setHeader('Content-Security-Policy', `script-src 'none'; sandbox;`)
  res.setHeader('X-Nextjs-Cache', xCache)

  return { finished: false }
}

function sendResponse(
  sendDedupe: { sent: boolean },
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  maxAge: number,
  contentType: string | null,
  buffer: Buffer,
  isStatic: boolean,
  isDev: boolean,
  xCache: XCacheHeader,
  etag?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (sendDedupe.sent) {
      return
    } else {
      sendDedupe.sent = true
    }
    const result = setResponseHeaders(
      req,
      res,
      url,
      etag || getHash([buffer]),
      maxAge,
      contentType,
      isStatic,
      isDev,
      xCache
    )
    if (result.finished) {
      resolve()
    } else {
      res.on('finish', () => resolve())
      res.on('end', () => resolve())
      res.on('error', () => reject())
      res.end(buffer, () => resolve())
    }
  })
}

function getSupportedMimeType(options: string[], accept = ''): string {
  const mimeType = mediaType(accept, options)
  return accept.includes(mimeType) ? mimeType : ''
}

function getHash(items: (string | number | Buffer)[]) {
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

export async function resizeImage(
  content: Buffer,
  dimension: 'width' | 'height',
  size: number,
  // Should match VALID_BLUR_EXT
  extension: 'avif' | 'webp' | 'png' | 'jpeg',
  quality: number
): Promise<Buffer> {
  if (sharp) {
    const transformer = sharp(content)

    if (extension === 'avif') {
      if (transformer.avif) {
        transformer.avif({ quality })
      } else {
        console.warn(
          chalk.yellow.bold('Warning: ') +
            `Your installed version of the 'sharp' package does not support AVIF images. Run 'yarn add sharp@latest' to upgrade to the latest version.\n` +
            'Read more: https://nextjs.org/docs/messages/sharp-version-avif'
        )
        transformer.webp({ quality })
      }
    } else if (extension === 'webp') {
      transformer.webp({ quality })
    } else if (extension === 'png') {
      transformer.png({ quality })
    } else if (extension === 'jpeg') {
      transformer.jpeg({ quality })
    }
    if (dimension === 'width') {
      transformer.resize(size)
    } else {
      transformer.resize(null, size)
    }
    const buf = await transformer.toBuffer()
    return buf
  } else {
    const resizeOperationOpts: Operation =
      dimension === 'width'
        ? { type: 'resize', width: size }
        : { type: 'resize', height: size }
    const buf = await processBuffer(
      content,
      [resizeOperationOpts],
      extension,
      quality
    )
    return buf
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

function getFileMetadata(filename: string): FileMetadata {
  const [maxAgeStr, expireAtSt, etag, extension] = filename.split('.')
  const maxAge = Number(maxAgeStr)
  const expireAt = Number(expireAtSt)
  const contentType = getContentType(extension)
  return { filename, maxAge, expireAt, etag, contentType }
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
