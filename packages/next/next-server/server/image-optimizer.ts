import { parse } from 'url'
import { IncomingMessage, ServerResponse } from 'http'
import { join } from 'path'
import accept from '@hapi/accept'
import { createReadStream, createWriteStream, promises } from 'fs'
import { createHash } from 'crypto'
import Server from './next-server'
import { fileExists } from '../../lib/file-exists'

let sharp: typeof import('sharp')
//const AVIF = 'image/avif'
const WEBP = 'image/webp'
const MEDIA_TYPES = [/* AVIF, */ WEBP]
const CACHE_VERSION = 1

export async function imageOptimizer(
  server: Server,
  req: IncomingMessage,
  res: ServerResponse
) {
  const { nextConfig, distDir } = server
  const { sizes = [], domains = [] } = nextConfig?.experimental?.images || {}
  const { url: reqUrl = '/', headers } = req
  const { query } = parse(reqUrl, true)
  const { url, w, q } = query
  const proto = headers['x-forwarded-proto'] || 'http'
  const host = headers['x-forwarded-host'] || headers.host
  const mediaType = accept.mediaType(req.headers.accept, MEDIA_TYPES)

  if (!url) {
    res.statusCode = 400
    res.end('"url" parameter is required')
    return { finished: true }
  } else if (Array.isArray(url)) {
    res.statusCode = 400
    res.end('"url" parameter cannot be an array')
    return { finished: true }
  }

  let absoluteUrl: URL
  try {
    absoluteUrl = new URL(url)

    if (
      Array.isArray(domains) &&
      domains.length > 0 &&
      !domains.includes(absoluteUrl.hostname)
    ) {
      res.statusCode = 400
      res.end('"url" parameter is not allowed')
      return { finished: true }
    }
  } catch (_error) {
    // url was not absolute so assuming relative url
    try {
      absoluteUrl = new URL(url, `${proto}://${host}`)
    } catch (__error) {
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

  if (Array.isArray(sizes) && sizes.length > 0 && !sizes.includes(width)) {
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

  const { href } = absoluteUrl
  const fileName = getFileName([CACHE_VERSION, href, width, quality, mediaType])
  const imageDir = join(distDir, 'cache', 'images')
  const cacheFile = join(imageDir, fileName)

  if (await fileExists(cacheFile)) {
    res.setHeader('Content-Type', mediaType)
    createReadStream(cacheFile).pipe(res)
    return { finished: true }
  }

  if (!sharp) {
    // Lazy load per https://github.com/vercel/next.js/discussions/17141
    // eslint-disable-next-line import/no-extraneous-dependencies
    sharp = require('sharp')
  }
  const transformer = sharp().resize(width)

  //if (mediaType === AVIF) {
  // Soon https://github.com/lovell/sharp/issues/2289
  //}
  if (mediaType === WEBP) {
    transformer.webp({ quality })
  }

  const fetchResponse = await fetch(href)

  if (!fetchResponse.ok) {
    throw new Error(`Unexpected status ${fetchResponse.status} from ${href}`)
  }
  if (!fetchResponse.body) {
    throw new Error(`No body from ${href}`)
  }

  await promises.mkdir(imageDir, { recursive: true })

  // We know this code only runs server-side so use Node Streams
  const body = (fetchResponse.body as any) as NodeJS.ReadableStream
  const imageTransform = body.pipe(transformer)
  imageTransform.pipe(createWriteStream(cacheFile))
  res.setHeader('Content-Type', mediaType)
  imageTransform.pipe(res)
  return { finished: true }
}

function getFileName(items: (string | number | undefined)[]) {
  const hash = createHash('sha256')
  for (let item of items) {
    hash.update(String(item))
  }
  // See https://en.wikipedia.org/wiki/Base64#Filenames
  return hash.digest('base64').replace(/\//g, '-')
}
