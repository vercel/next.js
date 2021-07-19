import { mediaType } from '@hapi/accept'
import { createHash } from 'crypto'
import { createReadStream, promises } from 'fs'
import { getOrientation, Orientation } from 'get-orientation'
import { IncomingMessage, ServerResponse } from 'http'
// @ts-ignore no types for is-animated
import isAnimated from 'next/dist/compiled/is-animated'
import { join } from 'path'
import Stream from 'stream'
import nodeUrl, { UrlWithParsedQuery } from 'url'
import { NextConfig } from './config-shared'
import { fileExists } from '../lib/file-exists'
import { ImageConfig, imageConfigDefault } from './image-config'
import { processBuffer, Operation } from './lib/squoosh/main'
import Server from './next-server'
import { sendEtagResponse } from './send-payload'
import { getContentType, getExtension } from './serve-static'

//const AVIF = 'image/avif'
const WEBP = 'image/webp'
const PNG = 'image/png'
const JPEG = 'image/jpeg'
const GIF = 'image/gif'
const SVG = 'image/svg+xml'
const CACHE_VERSION = 3
const MODERN_TYPES = [/* AVIF, */ WEBP]
const ANIMATABLE_TYPES = [WEBP, PNG, GIF]
const VECTOR_TYPES = [SVG]
const BLUR_IMG_SIZE = 8 // should match `next-image-loader`
const inflightRequests = new Map<string, Promise<undefined>>()

export async function imageOptimizer(
  server: Server,
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: UrlWithParsedQuery,
  nextConfig: NextConfig,
  distDir: string,
  isDev = false
) {
  const imageData: ImageConfig = nextConfig.images || imageConfigDefault
  const {
    deviceSizes = [],
    imageSizes = [],
    domains = [],
    loader,
    minimumCacheTTL = 60,
  } = imageData

  if (loader !== 'default') {
    await server.render404(req, res, parsedUrl)
    return { finished: true }
  }

  const { headers } = req
  const { url, w, q } = parsedUrl.query
  const mimeType = getSupportedMimeType(MODERN_TYPES, headers.accept)
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
  const isStatic = url.startsWith('/_next/static/image')

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
  const now = Date.now()

  // If there're concurrent requests hitting the same resource and it's still
  // being optimized, wait before accessing the cache.
  if (inflightRequests.has(hash)) {
    await inflightRequests.get(hash)
  }
  let dedupeResolver: (val?: PromiseLike<undefined>) => void
  inflightRequests.set(
    hash,
    new Promise((resolve) => (dedupeResolver = resolve))
  )

  try {
    if (await fileExists(hashDir, 'directory')) {
      const files = await promises.readdir(hashDir)
      for (let file of files) {
        const [maxAgeStr, expireAtSt, etag, extension] = file.split('.')
        const maxAge = Number(maxAgeStr)
        const expireAt = Number(expireAtSt)
        const contentType = getContentType(extension)
        const fsPath = join(hashDir, file)
        if (now < expireAt) {
          const result = setResponseHeaders(
            req,
            res,
            etag,
            maxAge,
            contentType,
            isStatic,
            isDev
          )
          if (!result.finished) {
            createReadStream(fsPath).pipe(res)
          }
          return { finished: true }
        } else {
          await promises.unlink(fsPath)
        }
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
        mockRes._write = (chunk: Buffer | string) => {
          mockRes.write(chunk)
        }

        const mockHeaders: Record<string, string | string[]> = {}

        mockRes.writeHead = (_status: any, _headers: any) =>
          Object.assign(mockHeaders, _headers)
        mockRes.getHeader = (name: string) => mockHeaders[name.toLowerCase()]
        mockRes.getHeaders = () => mockHeaders
        mockRes.getHeaderNames = () => Object.keys(mockHeaders)
        mockRes.setHeader = (name: string, value: string | string[]) =>
          (mockHeaders[name.toLowerCase()] = value)
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

        await server.getRequestHandler()(
          mockReq,
          mockRes,
          nodeUrl.parse(href, true)
        )
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

    const expireAt = Math.max(maxAge, minimumCacheTTL) * 1000 + now

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
        sendResponse(
          req,
          res,
          maxAge,
          upstreamType,
          upstreamBuffer,
          isStatic,
          isDev
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

      let optimizedBuffer: Buffer | undefined
      //if (contentType === AVIF) {
      //} else
      if (contentType === WEBP) {
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

      if (optimizedBuffer) {
        await writeToCacheDir(
          hashDir,
          contentType,
          maxAge,
          expireAt,
          optimizedBuffer
        )
        sendResponse(
          req,
          res,
          maxAge,
          contentType,
          optimizedBuffer,
          isStatic,
          isDev
        )
      } else {
        throw new Error('Unable to optimize buffer')
      }
    } catch (error) {
      sendResponse(
        req,
        res,
        maxAge,
        upstreamType,
        upstreamBuffer,
        isStatic,
        isDev
      )
    }

    return { finished: true }
  } finally {
    // Make sure to remove the hash in the end.
    dedupeResolver!()
    inflightRequests.delete(hash)
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
}

function setResponseHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  etag: string,
  maxAge: number,
  contentType: string | null,
  isStatic: boolean,
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
  return { finished: false }
}

function sendResponse(
  req: IncomingMessage,
  res: ServerResponse,
  maxAge: number,
  contentType: string | null,
  buffer: Buffer,
  isStatic: boolean,
  isDev: boolean
) {
  const etag = getHash([buffer])
  const result = setResponseHeaders(
    req,
    res,
    etag,
    maxAge,
    contentType,
    isStatic,
    isDev
  )
  if (!result.finished) {
    res.end(buffer)
  }
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
