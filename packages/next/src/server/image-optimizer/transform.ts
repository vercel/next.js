// WARNING: This module is publicly exposed as `next/image-optimizer-transform`
// and consumed outside this repo, so its location and export surface are a
// stable contract. Please keep this module lightweight with very few imports
// since it runs in a child process. Please do NOT add new imports without
// considering their impact on its dependency graph.
import isAnimated from 'next/dist/compiled/is-animated'
import type { NextConfigComplete } from '../config-shared'
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
import { getSharp, optimizeImage } from './sharp'

export { ImageError }
export { getMaxAge }
export { getSharp }

const ANIMATABLE_TYPES = [WEBP, PNG, GIF]
const BYPASS_TYPES = [SVG, ICO, ICNS, BMP, JXL, HEIC]

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
    | 'imgOptMozjpeg'
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
  logger?: ImageOptimizerTransformLogger
}

export interface ImageOptimizerResult {
  buffer: Buffer
  contentType: string
  maxAge: number
  etag: string
  upstreamEtag: string
  /**
   * `true` when `buffer` was produced by sharp. `false` when the upstream
   * image was passed through (animated, a bypassed type, or optimization
   * failed).
   */
  optimized: boolean
  error?: unknown
}

export async function imageOptimizerTransform(
  imageUpstream: ImageUpstream,
  paramsResult: ImageOptimizerTransformParams,
  nextConfig: ImageOptimizerTransformConfig,
  opts: ImageOptimizerTransformOptions = {}
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
      optimized: false,
    }
  }
  if (BYPASS_TYPES.includes(upstreamType)) {
    return {
      buffer: upstreamBuffer,
      contentType: upstreamType,
      maxAge,
      etag: upstreamEtag,
      upstreamEtag,
      optimized: false,
    }
  }

  let contentType: string

  if (mimeType) {
    contentType = mimeType
  } else if (upstreamType === WEBP || upstreamType === AVIF) {
    // Downlevel WebP and AVIF when the client does not advertise support.
    contentType = JPEG
  } else {
    contentType = upstreamType
  }

  try {
    const optimizedBuffer = await optimizeImage({
      buffer: upstreamBuffer,
      contentType,
      quality,
      width,
      concurrency: nextConfig.experimental.imgOptConcurrency,
      operationCache: nextConfig.experimental.imgOptOperationCache,
      limitInputPixels: nextConfig.experimental.imgOptMaxInputPixels,
      sequentialRead: nextConfig.experimental.imgOptSequentialRead,
      timeoutInSeconds: nextConfig.experimental.imgOptTimeoutInSeconds,
      mozjpeg: nextConfig.experimental.imgOptMozjpeg,
    })
    return {
      buffer: optimizedBuffer,
      contentType,
      maxAge,
      etag: getImageEtag(optimizedBuffer),
      upstreamEtag,
      optimized: true,
    }
  } catch (error) {
    // If we fail to optimize, fallback to the original image
    return {
      buffer: upstreamBuffer,
      contentType: upstreamType,
      maxAge: nextConfig.images.minimumCacheTTL,
      etag: upstreamEtag,
      upstreamEtag,
      optimized: false,
      error,
    }
  }
}
