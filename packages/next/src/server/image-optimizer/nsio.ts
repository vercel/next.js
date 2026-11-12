// nsio (`@next/safe-image-optimization`) is an alternative to sharp, enabled by
// `experimental.imgOptSafeMode`.
//
// This module is imported by `transform.ts`, which runs in a child process, so
// keep its imports minimal. nsio itself is only required when it's used.
import type { Pool } from '@next/safe-image-optimization'
import { GIF, JPEG, PNG, WEBP } from './image-type'
import {
  NSIO_INPUT_FORMATS,
  NSIO_OUTPUT_MIME_TYPES,
} from '../../shared/lib/image-optimizer-constants'

let _pool: Pool | undefined

function getPool(concurrency: number | null | undefined): Pool {
  if (!_pool) {
    const { Pool } =
      require('@next/safe-image-optimization') as typeof import('@next/safe-image-optimization')
    _pool = new Pool({ concurrency: concurrency ?? undefined })
  }
  return _pool
}

/**
 * The `@next/safe-image-optimization` equivalent of `optimizeImage()`.
 * Supported options are slightly different.
 *
 * Note: Unlike sharp, nsio has no operation cache, so every request decodes and
 * encodes again. This is likely fine, as Next.js has a disk cache that's
 * checked before calling either sharp or nsio.
 */
export async function nsioOptimizeImage({
  buffer,
  contentType,
  quality,
  width,
  concurrency,
  maxInputPixels,
  timeoutInSeconds,
  mozjpeg = true,
}: {
  buffer: Buffer
  contentType: string
  quality: number
  width: number
  concurrency?: number | null
  maxInputPixels?: number
  timeoutInSeconds: number
  mozjpeg?: boolean
}): Promise<Buffer> {
  if (!NSIO_OUTPUT_MIME_TYPES.includes(contentType)) {
    // The caller catches this error and falls back to the source (unoptimized)
    // image
    throw new Error(
      `Unsupported output content type for nsio image optimization: ${contentType}`
    )
  }

  const pipeline = getPool(concurrency)
    .prepare(buffer)
    .allowInputFormats(NSIO_INPUT_FORMATS)
    .timeoutMs(timeoutInSeconds * 1000)
    .autoOrient()
    .resize(width, null, { withoutEnlargement: true })

  if (maxInputPixels !== undefined) {
    pipeline.limitInputPixels(maxInputPixels)
  }

  if (contentType === WEBP) {
    pipeline.webp({ quality })
  } else if (contentType === PNG) {
    // Unlike sharp, there's no palette quantization, so `quality` doesn't
    // apply to PNGs.
    pipeline.png()
  } else if (contentType === JPEG) {
    // Like sharp, mozjpeg output is progressive, and baseline otherwise.
    pipeline.jpeg({ quality, mozjpeg })
  } else if (contentType === GIF) {
    pipeline.gif()
  } else {
    throw new Error(
      'unreachable: contentType must be in NSIO_OUTPUT_MIME_TYPES'
    )
  }

  return pipeline.toBuffer()
}
