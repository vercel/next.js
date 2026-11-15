// This module is part of the `next/experimental/image-optimizer-transform`
// dependency graph, which runs in a child process. Please keep it lightweight
// with very few imports. Only `getSharp` is public (re-exported from
// `./transform`).
import isError from '../../lib/is-error'
import { AVIF, JPEG, PNG, WEBP } from './image-type'

let _sharp: typeof import('sharp').default

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
  maxInputPixels,
  sequentialRead,
  timeoutInSeconds,
  mozjpeg = true,
}: {
  buffer: Buffer
  contentType: string
  quality: number
  width: number
  height?: number
  concurrency?: number | null
  operationCache?: boolean | null | undefined
  maxInputPixels?: number
  sequentialRead?: boolean | null
  timeoutInSeconds?: number
  mozjpeg?: boolean
}): Promise<Buffer> {
  const sharp = getSharp(concurrency, operationCache)
  const transformer = sharp(buffer, {
    limitInputPixels: maxInputPixels,
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
    transformer.jpeg({ quality, mozjpeg })
  }

  const optimizedBuffer = await transformer.toBuffer()

  return optimizedBuffer
}
