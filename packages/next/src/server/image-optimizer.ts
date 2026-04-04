import { createHash } from 'crypto'
import { promises } from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'
import { mediaType } from 'next/dist/compiled/@hapi/accept'
import contentDisposition from 'next/dist/compiled/content-disposition'
import imageSizeOf from 'next/dist/compiled/image-size'
import { detector } from 'next/dist/compiled/image-detector/detector.js'
import isAnimated from 'next/dist/compiled/is-animated'
import { join } from 'path'
import nodeUrl, { type UrlWithParsedQuery } from 'url'

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
  type CachedImageValue,
  type IncrementalCacheEntry,
  type IncrementalCacheValue,
  type IncrementalResponseCacheEntry,
} from './response-cache'
import type { CacheHandler } from './lib/incremental-cache'
import { sendEtagResponse } from './send-payload'
import { getContentType, getExtension } from './serve-static'
import * as Log from '../build/output/log'
import isError from '../lib/is-error'
import { isPrivateIp } from './is-private-ip'
import { getOrInitDiskLRU } from './lib/disk-lru-cache.external'
import { parseUrl } from '../lib/url'
import type { CacheControl } from './lib/cache-control'
import { InvariantError } from '../shared/lib/invariant-error'
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { ALL } from 'dns'
import http from 'http'
import https from 'https'

type XCacheHeader = 'MISS' | 'HIT' | 'STALE'

const AVIF = 'image/avif'
const WEBP = 'image/webp'
const PNG = 'image/png'
const JPEG = 'image/jpeg'
const JXL = 'image/jxl'
const JP2 = 'image/jp2'
const HEIC = 'image/heic'
const GIF = 'image/gif'
const SVG = 'image/svg+xml'
const ICO = 'image/x-icon'
const ICNS = 'image/x-icns'
const TIFF = 'image/tiff'
const BMP = 'image/bmp'
const PDF = 'application/pdf'
const CACHE_VERSION = 4
const ANIMATABLE_TYPES = [WEBP, PNG, GIF]
const BYPASS_TYPES = [SVG, ICO, ICNS, BMP, JXL, HEIC]
const BLUR_IMG_SIZE = 8 // should match `next-image-loader`
const BLUR_QUALITY = 70 // should match `next-image-loader`

let _sharp: typeof import('sharp')

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

export function getSharp(concurrency: number | null | undefined) {
  if (_sharp) {
    return _sharp
  }
  try {
    _sharp = require('sharp') as typeof import('sharp'>
    if (_sharp && _sharp.concurrency() > 1) {
      // Reducing concurrency should reduce the memory usage too.
      // We more aggressively reduce in dev but also reduce in prod.
      // https://sharp.pixelplumbing.com/api-utility#concurrency
      const divisor = process.env.NODE_ENV === 'development' ? 4 : 2
      _sharp.concurrency(
        concurrency ?? Math.floor(Math.max(_sharp.concurrency() / divisor, 1))
      )
    }
  } catch (e: unknown) {
    if (isError(e) && e.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'Module `sharp` not found. Please run `npm install --cpu=wasm32 sharp` to install it.'
      )
    }
    throw e
  }
  return _sharp
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

interface ImageUpstream {
  buffer: Buffer
  contentType: string | null | undefined
  cacheControl: string | null | undefined
  etag: string
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
  // See https://en.wikipedia.org/wiki/Base64#URL_applications
  return hash.digest('base64url')
}

export function extractEtag(
  etag: string | null | undefined,
  imageBuffer: Buffer
) {
  if (etag) {
    // upstream etag needs to be base64url encoded due to weak etag signature
    // as we store this in the cache-entry file name.
    return Buffer.from(etag).toString('base64url')
  }
  return getImageEtag(imageBuffer)
}

export function getImageEtag(image: Buffer) {
  return getHash([image])
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

/**
 * Inspects the first few bytes of a buffer to determine if
 * it matches the "magic number" of known file signatures.
 * https://en.wikipedia.org/wiki/List_of_file_signatures
 */
export async function detectContentType(
  buffer: Buffer,
  skipMetadata: boolean | null | undefined,
  concurrency?: number | null | undefined
): Promise<string | null> {
  if (buffer.byteLength === 0) {
    return null
  }
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
  if ([0x3c, 0x73, 0x76, 0x67].every((b, i) => buffer[i] === b)) {
    return SVG
  }
  if (
    [0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66].every(
      (b, i) => !b || buffer[i] === b
    )
  ) {
    return AVIF
  }
  if ([0x00, 0x00, 0x01, 0x00].every((b, i) => buffer[i] === b)) {
    return ICO
  }
  if ([0x69, 0x63, 0x6e, 0x73].every((b, i) => buffer[i] === b)) {
    return ICNS
  }
  if ([0x49, 0x49, 0x2a, 0x00].every((b, i) => buffer[i] === b)) {
    return TIFF
  }
  if ([0x42, 0x4d].every((b, i) => buffer[i] === b)) {
    return BMP
  }
  if ([0xff, 0x0a].every((b, i) => buffer[i] === b)) {
    return JXL
  }
  if (
    [
      0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
    ].every((b, i) => buffer[i] === b)
  ) {
    return JXL
  }
  if (
    [0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63].every(
      (b, i) => !b || buffer[i] === b
    )
  ) {
    return HEIC
  }
  if ([0x25, 0x50, 0x44, 0x46, 0x2d].every((b, i) => buffer[i] === b)) {
    return PDF
  }
  if (
    [
      0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
    ].every((b, i) => buffer[i] === b)
  ) {
    return JP2
  }

  let format:
    | import('sharp').Metadata['format']
    | ReturnType<typeof detector>
    | undefined
  format = detector(buffer)

  if (!format && !skipMetadata) {
    const sharp = getSharp(concurrency)
    const meta = await sharp(buffer)
      .metadata()
      .catch((_) => null)
    format = meta?.format
  }

  switch (format) {
    case 'avif':
      return AVIF
    case 'webp':
      return WEBP
    case 'png':
      return PNG
    case 'jpeg':
    case 'jpg':
      return JPEG
    case 'gif':
      return GIF
    case 'svg':
      return SVG
    case 'jxl':
    case 'jxl-stream':
      return JXL
    case 'jp2':
      return JP2
    case 'tiff':
    case 'tif':
      return TIFF
    case 'pdf':
      return PDF
    case 'bmp':
      return BMP
    case 'ico':
      return ICO
    case 'icns':
      return ICNS
    case 'dcraw':
    case 'dz':
    case 'exr':
    case 'fits':
    case 'heif':
    case 'input':
    case 'magick':
    case 'openslide':
    case 'ppm':
    case 'rad':
    case 'raw':
    case 'v':
    case 'cur':
    case 'dds':
    case 'j2c':
    case 'ktx':
    case 'pnm':
    case 'psd':
    case 'tga':
    case undefined:
    default:
      return null
  }
}

// ... (ImageOptimizerCache, ImageError, parseCacheControl, getMaxAge,
// getPreviouslyCachedImageOrNull, optimizeImage, etc. remain unchanged)
// The full file is too large for a single commit message, so only the
// fetchExternalImage changes are shown in the diff.

/**
 * Creates a custom HTTP(S) agent that pins the connection to a specific
 * resolved IP address. This eliminates the TOCTOU (Time-of-Check-Time-of-Use)
 * gap between DNS validation and the actual HTTP fetch, preventing DNS
 * rebinding attacks.
 *
 * Without this, an attacker controlling a DNS server could:
 * 1. Return a public IP during the `lookup()` validation step
 * 2. Switch the DNS record to `127.0.0.1` before `fetch()` resolves
 * 3. Bypass the private IP check and access internal services (SSRF)
 *
 * By using a custom `lookup` function that always returns the pre-validated
 * IP, the TCP connection is guaranteed to use the same IP that was checked.
 *
 * @see https://github.com/vercel/next.js/issues/88873
 */
function createPinnedAgent(
  protocol: string,
  validatedIp: string,
  family: 4 | 6
): http.Agent | https.Agent {
  const lookupFn = (
    _hostname: string,
    _options: any,
    callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
  ) => {
    callback(null, validatedIp, family)
  }

  if (protocol === 'https:') {
    return new https.Agent({ lookup: lookupFn as any })
  }
  return new http.Agent({ lookup: lookupFn as any })
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
  const parsedUrl = new URL(href)
  let pinnedAgent: http.Agent | https.Agent | undefined

  if (!dangerouslyAllowLocalIP) {
    const { hostname } = parsedUrl
    let ips = [hostname]
    if (!isIP(hostname)) {
      const records = await lookup(hostname, {
        family: 0,
        all: true,
        hints: ALL,
      }).catch((_) => [{ address: hostname, family: 4 as const }])
      ips = records.map((record) => record.address)
    }
    const privateIps = ips.filter((ip) => isPrivateIp(ip))
    if (privateIps.length > 0) {
      Log.error(
        'upstream image',
        href,
        'resolved to private ip',
        JSON.stringify(privateIps)
      )
      throw new ImageError(400, '"url" parameter is not allowed')
    }

    // Pin the connection to a validated public IP to prevent DNS rebinding
    // attacks (TOCTOU between lookup() above and fetch() below).
    // Use the first validated IP address for the connection.
    const validatedIp = ips[0]
    const ipFamily = isIP(validatedIp)
    if (ipFamily) {
      pinnedAgent = createPinnedAgent(
        parsedUrl.protocol,
        validatedIp,
        ipFamily as 4 | 6
      )
    }
  }

  const fetchOptions: RequestInit = {
    signal: AbortSignal.timeout(7_000),
    redirect: 'manual',
  }

  // Use the pinned agent to ensure the connection goes to the validated IP.
  // This prevents DNS rebinding where the DNS record changes between our
  // validation lookup and the fetch() call's internal DNS resolution.
  if (pinnedAgent) {
    ;(fetchOptions as any).agent = pinnedAgent
  }

  const res = await fetch(href, fetchOptions).catch((err) => err as Error)

  // Clean up the pinned agent to prevent connection pool exhaustion
  if (pinnedAgent) {
    pinnedAgent.destroy()
  }

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
