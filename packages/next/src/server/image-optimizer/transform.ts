// WARNING: Please keep this module lightweight with very few imports since
// we intend to run it in a child process in the future. Please do NOT
// add new imports without considering their impact on its dependency graph.
import isAnimated from 'next/dist/compiled/is-animated'
import type { NextConfigComplete } from '../config-shared'
import isError from '../../lib/is-error'
import { detectContentType } from './detect-content-type'
import {
  AVIF,
  BMP,
  GIF,
  HEIC,
  ICNS,
  ICO,
  JPEG,
  JXL,
  PNG,
  SVG,
  WEBP,
} from './image-type'
import { getImageEtag } from './extract-etag'
import { getMaxAge } from './get-max-age'
import { ImageError } from './image-error'

const ANIMATABLE_TYPES = [WEBP, PNG, GIF]
const BYPASS_TYPES = [SVG, ICO, ICNS, BMP, JXL, HEIC]

let _sharp: typeof import('sharp').default

export interface ImageUpstream {
  buffer: Buffer
  contentType: string | null | undefined
  cacheControl: string | null | undefined
  etag: string
}

export interface ImageOptimizerTransformParams {
  href: string
  width: number
  quality: number
  mimeType: string
}

export type ImageOptimizerTransformConfig = {
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
}

export interface ImageOptimizerTransformLogger {
  error(...args: unknown[]): void
  warnOnce(message: string): void
}

export interface ImageOptimizerTransformOptions {
  isValidMime: (contentType: string) => boolean
  previousOutput?: {
    buffer: Buffer
    maxAge?: number
    etag: string
    upstreamEtag: string
  }
  logger?: ImageOptimizerTransformLogger
  handleDevOutput?: (
    buffer: Buffer,
    contentType: string
  ) => Promise<{ buffer: Buffer; contentType: string }>
}

export interface ImageOptimizerResult {
  buffer: Buffer
  contentType: string
  maxAge: number
  etag: string
  upstreamEtag: string
  error?: unknown
}

export function getSharp(
  concurrency: number | null | undefined,
  operationCache: boolean | null | undefined
) {
  if (_sharp) {
    return _sharp
  }
  try {
    _sharp = require('sharp') as typeof import('sharp').default
    _sharp.block({ operation: ['VipsForeignLoad'] })
    _sharp.unblock({
      operation: [
        'VipsForeignLoadHeif', // avif
        'VipsForeignLoadJpeg',
        'VipsForeignLoadNsgif',
        'VipsForeignLoadPng',
        'VipsForeignLoadSvg',
        'VipsForeignLoadTiff',
        'VipsForeignLoadWebp',
      ],
    })
    if (typeof operationCache === 'boolean') {
      _sharp.cache(operationCache)
    }
    if (_sharp.concurrency() > 1) {
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

export async function optimizeImage({
  buffer,
  contentType,
  quality,
  width,
  height,
  concurrency,
  operationCache,
  limitInputPixels,
  sequentialRead,
  timeoutInSeconds,
}: {
  buffer: Buffer
  contentType: string
  quality: number
  width: number
  height?: number
  concurrency?: number | null
  operationCache?: boolean | null | undefined
  limitInputPixels?: number
  sequentialRead?: boolean | null
  timeoutInSeconds?: number
}): Promise<Buffer> {
  const sharp = getSharp(concurrency, operationCache)
  const transformer = sharp(buffer, {
    limitInputPixels,
    sequentialRead: sequentialRead ?? undefined,
  })
    .timeout({
      seconds: timeoutInSeconds ?? 7,
    })
    .rotate()

  if (height) {
    transformer.resize(width, height)
  } else {
    transformer.resize(width, undefined, {
      withoutEnlargement: true,
    })
  }

  if (contentType === AVIF) {
    transformer.avif({
      // Scale the quality to try and match webp. This ratio was derived
      // from sharp's default 80 (webp) and 50 (avif), and then verified
      // using dssim and ssimulacra2 visual quality tests.
      quality: Math.max(Math.round(quality * (50 / 80)), 1),
      effort: 3,
    })
  } else if (contentType === WEBP) {
    transformer.webp({ quality })
  } else if (contentType === PNG) {
    transformer.png({ quality })
  } else if (contentType === JPEG) {
    transformer.jpeg({ quality, mozjpeg: true })
  }

  const optimizedBuffer = await transformer.toBuffer()

  return optimizedBuffer
}

export async function imageOptimizerTransform(
  imageUpstream: ImageUpstream,
  paramsResult: ImageOptimizerTransformParams,
  nextConfig: ImageOptimizerTransformConfig,
  opts: ImageOptimizerTransformOptions
): Promise<ImageOptimizerResult> {
  const { href, quality, width, mimeType } = paramsResult
  const { buffer: upstreamBuffer, etag: upstreamEtag } = imageUpstream
  const maxAge = Math.max(
    nextConfig.images.minimumCacheTTL,
    getMaxAge(imageUpstream.cacheControl)
  )
  const upstreamType = await detectContentType(upstreamBuffer)

  if (
    !upstreamType ||
    !upstreamType.startsWith('image/') ||
    upstreamType.includes(',')
  ) {
    opts.logger?.error(
      "The requested resource isn't a valid image for",
      href,
      'received',
      upstreamType
    )
    throw new ImageError(400, "The requested resource isn't a valid image.")
  }
  if (
    upstreamType.startsWith('image/svg') &&
    !nextConfig.images.dangerouslyAllowSVG
  ) {
    opts.logger?.error(
      `The requested resource "${href}" has type "${upstreamType}" but dangerouslyAllowSVG is disabled. Consider adding the "unoptimized" property to the <Image>.`
    )
    throw new ImageError(
      400,
      '"url" parameter is valid but image type is not allowed'
    )
  }
  if (ANIMATABLE_TYPES.includes(upstreamType) && isAnimated(upstreamBuffer)) {
    opts.logger?.warnOnce(
      `The requested resource "${href}" is an animated image so it will not be optimized. Consider adding the "unoptimized" property to the <Image>.`
    )
    return {
      buffer: upstreamBuffer,
      contentType: upstreamType,
      maxAge,
      etag: upstreamEtag,
      upstreamEtag,
    }
  }
  if (BYPASS_TYPES.includes(upstreamType)) {
    return {
      buffer: upstreamBuffer,
      contentType: upstreamType,
      maxAge,
      etag: upstreamEtag,
      upstreamEtag,
    }
  }

  let contentType: string

  if (mimeType) {
    contentType = mimeType
  } else if (
    opts.isValidMime(upstreamType) &&
    upstreamType !== WEBP &&
    upstreamType !== AVIF
  ) {
    contentType = upstreamType
  } else {
    contentType = JPEG
  }

  if (opts.previousOutput) {
    return {
      buffer: opts.previousOutput.buffer,
      contentType,
      maxAge: opts.previousOutput.maxAge || maxAge,
      etag: opts.previousOutput.etag,
      upstreamEtag: opts.previousOutput.upstreamEtag,
    }
  }

  try {
    let optimizedBuffer = await optimizeImage({
      buffer: upstreamBuffer,
      contentType,
      quality,
      width,
      concurrency: nextConfig.experimental.imgOptConcurrency,
      operationCache: nextConfig.experimental.imgOptOperationCache,
      limitInputPixels: nextConfig.experimental.imgOptMaxInputPixels,
      sequentialRead: nextConfig.experimental.imgOptSequentialRead,
      timeoutInSeconds: nextConfig.experimental.imgOptTimeoutInSeconds,
    })
    if (opts.handleDevOutput) {
      const output = await opts.handleDevOutput(optimizedBuffer, contentType)
      optimizedBuffer = output.buffer
      contentType = output.contentType
    }
    return {
      buffer: optimizedBuffer,
      contentType,
      maxAge,
      etag: getImageEtag(optimizedBuffer),
      upstreamEtag,
    }
  } catch (error) {
    if (upstreamType) {
      // If we fail to optimize, fallback to the original image
      return {
        buffer: upstreamBuffer,
        contentType: upstreamType,
        maxAge: nextConfig.images.minimumCacheTTL,
        etag: upstreamEtag,
        upstreamEtag,
        error,
      }
    } else {
      throw new ImageError(
        400,
        'Unable to optimize image and unable to fallback to upstream image'
      )
    }
  }
}
