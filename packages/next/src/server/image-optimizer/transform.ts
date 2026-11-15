// WARNING: This module is publicly exposed as
// `next/experimental/image-optimizer-transform` and consumed outside this repo,
// so its location and export surface are a stable contract. Please keep this
// module lightweight with very few imports since it runs in a child process.
// Please do NOT add new imports without considering their impact on its
// dependency graph.
import isAnimated from 'next/dist/compiled/is-animated'
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

export interface ImageOptimizerTransformLogger {
  error(...args: unknown[]): void
  warnOnce(message: string): void
}

// This intentionally doesn't reference `NextConfigComplete`, whose normalized
// shape is an internal detail. `getImageOptimizerTransformOptions` in
// `../image-optimizer` maps the Next.js config onto these options.
export interface ImageOptimizerTransformOptions {
  /** Allows SVG sources. Defaults to `false`. */
  dangerouslyAllowSVG?: boolean
  /** The minimum `maxAge` of the result, in seconds. Defaults to `0`. */
  minimumCacheTTL?: number
  /** The sharp thread pool size. */
  concurrency?: number | null
  /** Enables or disables the libvips operation cache. */
  operationCache?: boolean | null
  /** The maximum number of pixels in a source image. */
  maxInputPixels?: number
  /** Passed to sharp as `sequentialRead`. */
  sequentialRead?: boolean | null
  /** Per-image processing timeout. Defaults to `7`. */
  timeoutInSeconds?: number
  /** Encodes JPEG output with mozjpeg. Defaults to `true`. */
  mozjpeg?: boolean
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
  opts: ImageOptimizerTransformOptions = {}
): Promise<ImageOptimizerResult> {
  const { href, quality, width, mimeType } = paramsResult
  const { buffer: upstreamBuffer, etag: upstreamEtag } = imageUpstream
  const { dangerouslyAllowSVG = false, minimumCacheTTL = 0 } = opts
  const maxAge = Math.max(
    minimumCacheTTL,
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
  if (upstreamType.startsWith('image/svg') && !dangerouslyAllowSVG) {
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
      ...opts,
      buffer: upstreamBuffer,
      contentType,
      quality,
      width,
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
      maxAge: minimumCacheTTL,
      etag: upstreamEtag,
      upstreamEtag,
      optimized: false,
      error,
    }
  }
}
