import nodeUrl, { UrlWithParsedQuery } from 'url'
import { IncomingMessage, ServerResponse } from 'http'
import { join } from 'path'
import { mediaType } from '@hapi/accept'
import { createReadStream, promises } from 'fs'
import { createHash } from 'crypto'
import Server from './next-server'
import { getContentType, getExtension } from './serve-static'
import { fileExists } from '../../lib/file-exists'
// @ts-ignore no types for is-animated
import isAnimated from 'next/dist/compiled/is-animated'
import Stream from 'stream'
import { sendEtagResponse } from './send-payload'
import { ImageConfig, imageConfigDefault } from './image-config'

let sharp: typeof import('sharp')
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

export async function imageOptimizer(
  server: Server,
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: UrlWithParsedQuery
) {
  const { nextConfig, distDir } = server
  const imageData: ImageConfig = nextConfig.images || imageConfigDefault
  const { deviceSizes = [], imageSizes = [], domains = [], loader } = imageData
  const sizes = [...deviceSizes, ...imageSizes]

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

  const width = parseInt(w, 10)

  if (!width || isNaN(width)) {
    res.statusCode = 400
    res.end('"w" parameter (width) must be a number greater than 0')
    return { finished: true }
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
      const _req: any = {
        headers: req.headers,
        method: req.method,
        url: href,
      }
      const resBuffers: Buffer[] = []
      const mockRes: any = new Stream.Writable()

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

      await server.getRequestHandler()(_req, mockRes, nodeUrl.parse(href, true))
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

  if (upstreamType) {
    const vector = VECTOR_TYPES.includes(upstreamType)
    const animate =
      ANIMATABLE_TYPES.includes(upstreamType) && isAnimated(upstreamBuffer)
    if (vector || animate) {
      sendResponse(req, res, upstreamType, upstreamBuffer)
      return { finished: true }
    }
  }

  const expireAt = maxAge * 1000 + now
  let contentType: string

  if (mimeType) {
    contentType = mimeType
  } else if (upstreamType?.startsWith('image/') && getExtension(upstreamType)) {
    contentType = upstreamType
  } else {
    contentType = JPEG
  }

  if (!sharp) {
    try {
      // eslint-disable-next-line import/no-extraneous-dependencies
      sharp = require('sharp')
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        error.message += '\n\nLearn more: https://err.sh/next.js/install-sharp'
        server.logError(error)
        sendResponse(req, res, upstreamType, upstreamBuffer)
        return { finished: true }
      }
      throw error
    }
  }

  try {
    const transformer = sharp(upstreamBuffer)
    transformer.rotate() // auto rotate based on EXIF data

    const { width: metaWidth } = await transformer.metadata()

    if (metaWidth && metaWidth > width) {
      transformer.resize(width)
    }

    //if (contentType === AVIF) {
    // Soon https://github.com/lovell/sharp/issues/2289
    //}
    if (contentType === WEBP) {
      transformer.webp({ quality })
    } else if (contentType === PNG) {
      transformer.png({ quality })
    } else if (contentType === JPEG) {
      transformer.jpeg({ quality })
    }

    const optimizedBuffer = await transformer.toBuffer()
    await promises.mkdir(hashDir, { recursive: true })
    const extension = getExtension(contentType)
    const etag = getHash([optimizedBuffer])
    const filename = join(hashDir, `${expireAt}.${etag}.${extension}`)
    await promises.writeFile(filename, optimizedBuffer)
    sendResponse(req, res, contentType, optimizedBuffer)
  } catch (error) {
    sendResponse(req, res, upstreamType, upstreamBuffer)
  }

  return { finished: true }
}

function sendResponse(
  req: IncomingMessage,
  res: ServerResponse,
  contentType: string | null,
  buffer: Buffer
) {
  const etag = getHash([buffer])
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
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
