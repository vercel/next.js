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
import { NextConfig } from '../../next-server/server/config-shared'
import { fileExists } from '../../lib/file-exists'
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
const CACHE_VERSION = 2
const MODERN_TYPES = [/* AVIF, */ WEBP]
const ANIMATABLE_TYPES = [WEBP, PNG, GIF]
const VECTOR_TYPES = [SVG]

const inflightRequests = new Map<string, Promise<undefined>>()

export async function imageOptimizer(
  server: Server,
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: UrlWithParsedQuery,
  nextConfig: NextConfig,
  distDir: string
) {
  const imageData: ImageConfig = nextConfig.images || imageConfigDefault
  const { deviceSizes = [], imageSizes = [], domains = [], loader } = imageData

  if (loader !== 'default') {
    await server.render404(req, res, parsedUrl)
    return { finished: true }
  }

  const { headers } = req
  const { url, w, q, s } = parsedUrl.query
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

  if (s && s !== '1') {
    res.statusCode = 400
    res.end('"s" parameter must be "1" or omitted')
    return { finished: true }
  }

  const isStatic = !!s

  const width = parseInt(w, 10)

  if (!width || isNaN(width)) {
    res.statusCode = 400
    res.end('"w" parameter (width) must be a number greater than 0')
    return { finished: true }
  }

  const sizes = [...deviceSizes, ...imageSizes]

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
        const [prefix, etag, extension] = file.split('.')
        const expireAt = Number(prefix)
        const contentType = getContentType(extension)
        const fsPath = join(hashDir, file)
        if (now < expireAt) {
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
          if (sendEtagResponse(req, res, etag)) {
            return { finished: true }
          }
          if (contentType) {
            res.setHeader('Content-Type', contentType)
          }
          createReadStream(fsPath).pipe(res)
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
      upstreamType = upstreamRes.headers.get('Content-Type')
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

        await server.getRequestHandler()(
          mockReq,
          mockRes,
          nodeUrl.parse(href, true)
        )
        await isStreamFinished
        res.statusCode = mockRes.statusCode

        upstreamBuffer = Buffer.concat(resBuffers)
        upstreamType = mockRes.getHeader('Content-Type')
        maxAge = getMaxAge(mockRes.getHeader('Cache-Control'))
      } catch (err) {
        res.statusCode = 500
        res.end('"url" parameter is valid but upstream response is invalid')
        return { finished: true }
      }
    }

    const expireAt = maxAge * 1000 + now

    if (upstreamType) {
      const vector = VECTOR_TYPES.includes(upstreamType)
      const animate =
        ANIMATABLE_TYPES.includes(upstreamType) && isAnimated(upstreamBuffer)
      if (vector || animate) {
        await writeToCacheDir(hashDir, upstreamType, expireAt, upstreamBuffer)
        sendResponse(req, res, upstreamType, upstreamBuffer, isStatic)
        return { finished: true }
      }

      // If upstream type is not a valid image type, return 400 error.
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
        await writeToCacheDir(hashDir, contentType, expireAt, optimizedBuffer)
        sendResponse(req, res, contentType, optimizedBuffer, isStatic)
      } else {
        throw new Error('Unable to optimize buffer')
      }
    } catch (error) {
      sendResponse(req, res, upstreamType, upstreamBuffer, isStatic)
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
  expireAt: number,
  buffer: Buffer
) {
  await promises.mkdir(dir, { recursive: true })
  const extension = getExtension(contentType)
  const etag = getHash([buffer])
  const filename = join(dir, `${expireAt}.${etag}.${extension}`)
  await promises.writeFile(filename, buffer)
}

function sendResponse(
  req: IncomingMessage,
  res: ServerResponse,
  contentType: string | null,
  buffer: Buffer,
  isStatic: boolean
) {
  const etag = getHash([buffer])
  res.setHeader(
    'Cache-Control',
    isStatic
      ? 'public, immutable, max-age=315360000'
      : 'public, max-age=0, must-revalidate'
  )
  if (sendEtagResponse(req, res, etag)) {
    return
  }
  if (contentType) {
    res.setHeader('Content-Type', contentType)
  }
  res.end(buffer)
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

export function getMaxAge(str: string | null): number {
  const minimum = 60
  const map = parseCacheControl(str)
  if (map) {
    let age = map.get('s-maxage') || map.get('max-age') || ''
    if (age.startsWith('"') && age.endsWith('"')) {
      age = age.slice(1, -1)
    }
    const n = parseInt(age, 10)
    if (!isNaN(n)) {
      return Math.max(n, minimum)
    }
  }
  return minimum
}
