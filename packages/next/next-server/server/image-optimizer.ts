import { UrlWithParsedQuery } from 'url'
import { IncomingMessage, ServerResponse } from 'http'
import { join, normalize, sep } from 'path'
import { mediaType } from '@hapi/accept'
import { createReadStream, promises } from 'fs'
import { createHash } from 'crypto'
import Server from './next-server'
import { getContentType, getExtension } from './serve-static'
import { fileExists } from '../../lib/file-exists'

let sharp: typeof import('sharp')
//const AVIF = 'image/avif'
const WEBP = 'image/webp'
const PNG = 'image/png'
const JPEG = 'image/jpeg'
const MIME_TYPES = [/* AVIF, */ WEBP, PNG, JPEG]
const CACHE_VERSION = 1

export async function imageOptimizer(
  server: Server,
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: UrlWithParsedQuery
) {
  const { nextConfig, distDir } = server
  const { sizes = [], domains = [] } = nextConfig?.experimental?.images || {}
  const { headers } = req
  const { url, w, q } = parsedUrl.query
  const mimeType = mediaType(headers.accept, MIME_TYPES) || ''

  if (!url) {
    res.statusCode = 400
    res.end('"url" parameter is required')
    return { finished: true }
  } else if (Array.isArray(url)) {
    res.statusCode = 400
    res.end('"url" parameter cannot be an array')
    return { finished: true }
  }

  let urlOrFile: {
    kind: 'url' | 'file'
    path: string
  }
  try {
    const absoluteUrl = new URL(url)
    if (!['http:', 'https:'].includes(absoluteUrl.protocol)) {
      res.statusCode = 400
      res.end('"url" parameter is invalid')
      return { finished: true }
    }
    if (!domains.includes(absoluteUrl.hostname)) {
      res.statusCode = 400
      res.end('"url" parameter is not allowed')
      return { finished: true }
    }
    urlOrFile = { kind: 'url', path: absoluteUrl.href }
  } catch (_error) {
    // url was not absolute so assuming relative url
    const { publicDir } = server
    const path = normalize(join(publicDir, url))
    if (path.startsWith(publicDir + sep) && (await fileExists(path, 'file'))) {
      urlOrFile = { kind: 'file', path }
    } else {
      res.statusCode = 400
      res.end('"url" parameter is invalid')
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

  const { kind, path } = urlOrFile
  const hash = getHash([CACHE_VERSION, path, width, quality, mimeType])
  const imagesDir = join(distDir, 'cache', 'images')
  const hashDir = join(imagesDir, hash)
  const now = Date.now()

  if (await fileExists(hashDir, 'directory')) {
    const files = await promises.readdir(hashDir)
    for (let file of files) {
      const [filename, extension] = file.split('.')
      const expireAt = Number(filename)
      const contentType = getContentType(extension)
      if (now < expireAt) {
        if (contentType) {
          res.setHeader('Content-Type', contentType)
        }
        createReadStream(join(hashDir, file)).pipe(res)
        return { finished: true }
      } else {
        await promises.unlink(join(hashDir, file))
      }
    }
  }

  let upstreamBuffer: Buffer
  let upstreamType: string | null
  let maxAge: number

  if (kind === 'file') {
    upstreamBuffer = await promises.readFile(path)
    const extension = path.split('.').pop()
    upstreamType = extension ? getContentType(extension) : null
    maxAge = getMaxAge(null)
  } else if (kind === 'url') {
    const upstreamRes = await fetch(path)
    if (!upstreamRes.ok) {
      server.logError(
        new Error(
          `Unexpected status ${upstreamRes.status} from upstream ${path}`
        )
      )
      return { finished: true }
    }
    upstreamBuffer = Buffer.from(await upstreamRes.arrayBuffer())
    upstreamType = upstreamRes.headers.get('Content-Type')
    maxAge = getMaxAge(upstreamRes.headers.get('Cache-Control'))
  } else {
    let k: never = kind
    server.logError(new Error(`Unhandled kind: ${k}`))
    return { finished: true }
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
    // Lazy load per https://github.com/vercel/next.js/discussions/17141
    // eslint-disable-next-line import/no-extraneous-dependencies
    sharp = require('sharp')
  }

  const transformer = sharp(upstreamBuffer).resize(width)

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

  try {
    const optimizedBuffer = await transformer.toBuffer()
    await promises.mkdir(hashDir, { recursive: true })
    const extension = getExtension(contentType)
    const filename = join(hashDir, `${expireAt}.${extension}`)
    await promises.writeFile(filename, optimizedBuffer)
    res.setHeader('Content-Type', contentType)
    res.end(optimizedBuffer)
  } catch (error) {
    server.logError(error)
    if (upstreamType) {
      res.setHeader('Content-Type', upstreamType)
    }
    res.end(upstreamBuffer)
  }

  return { finished: true }
}

function getHash(items: (string | number | undefined)[]) {
  const hash = createHash('sha256')
  for (let item of items) {
    hash.update(String(item))
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
