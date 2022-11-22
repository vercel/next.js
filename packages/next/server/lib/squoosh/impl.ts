import semver from 'next/dist/compiled/semver'
import { codecs as supportedFormats, preprocessors } from './codecs'
import ImageData from './image_data'

type EncoderKey = keyof typeof supportedFormats

// Fixed in Node.js 16.5.0 and newer.
// See https://github.com/nodejs/node/pull/39337
// Eventually, remove this delay when engines is updated.
// See https://github.com/vercel/next.js/blob/1bcc923439f495a1717421e06af7e64c6003072c/packages/next/package.json#L249-L251
const FIXED_VERSION = '16.5.0'
const DELAY_MS = 1000
let _promise: Promise<void> | undefined

function delayOnce(ms: number): Promise<void> {
  if (!_promise) {
    _promise = new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }
  return _promise
}

function maybeDelay(): Promise<void> {
  const isAppleM1 = process.arch === 'arm64' && process.platform === 'darwin'
  if (isAppleM1 && semver.lt(process.version, FIXED_VERSION)) {
    return delayOnce(DELAY_MS)
  }
  return Promise.resolve()
}

export async function decodeBuffer(
  _buffer: Buffer | Uint8Array
): Promise<ImageData> {
  const buffer = Buffer.from(_buffer)
  const firstChunk = buffer.slice(0, 16)
  const firstChunkString = Array.from(firstChunk)
    .map((v) => String.fromCodePoint(v))
    .join('')
  const key = Object.entries(supportedFormats).find(([, { detectors }]) =>
    detectors.some((detector) => detector.exec(firstChunkString))
  )?.[0] as EncoderKey | undefined
  if (!key) {
    throw Error(`Buffer has an unsupported format`)
  }
  const encoder = supportedFormats[key]
  const mod = await encoder.dec()
  const rgba = mod.decode(new Uint8Array(buffer))
  return rgba
}

export async function rotate(
  image: ImageData,
  numRotations: number
): Promise<ImageData> {
  image = ImageData.from(image)

  const m = await preprocessors['rotate'].instantiate()
  return await m(image.data, image.width, image.height, { numRotations })
}

type ResizeOpts = { image: ImageData } & (
  | { width: number; height?: never }
  | { height: number; width?: never }
  | { height: number; width: number }
)

export async function resize({ image, width, height }: ResizeOpts) {
  image = ImageData.from(image)

  const p = preprocessors['resize']
  const m = await p.instantiate()
  await maybeDelay()
  return await m(image.data, image.width, image.height, {
    ...p.defaultOptions,
    width,
    height,
  })
}

export async function encodeJpeg(
  image: ImageData,
  { quality }: { quality: number }
): Promise<Buffer | Uint8Array> {
  image = ImageData.from(image)

  const e = supportedFormats['mozjpeg']
  const m = await e.enc()
  await maybeDelay()
  const r = await m.encode(image.data, image.width, image.height, {
    ...e.defaultEncoderOptions,
    quality,
  })
  return Buffer.from(r)
}

export async function encodeWebp(
  image: ImageData,
  { quality }: { quality: number }
): Promise<Buffer | Uint8Array> {
  image = ImageData.from(image)

  const e = supportedFormats['webp']
  const m = await e.enc()
  await maybeDelay()
  const r = await m.encode(image.data, image.width, image.height, {
    ...e.defaultEncoderOptions,
    quality,
  })
  return Buffer.from(r)
}

export async function encodeAvif(
  image: ImageData,
  { quality }: { quality: number }
): Promise<Buffer | Uint8Array> {
  image = ImageData.from(image)

  const e = supportedFormats['avif']
  const m = await e.enc()
  await maybeDelay()
  const val = e.autoOptimize.min || 62
  const r = await m.encode(image.data, image.width, image.height, {
    ...e.defaultEncoderOptions,
    // Think of cqLevel as the "amount" of quantization (0 to 62),
    // so a lower value yields higher quality (0 to 100).
    cqLevel: Math.round(val - (quality / 100) * val),
  })
  return Buffer.from(r)
}

export async function encodePng(
  image: ImageData
): Promise<Buffer | Uint8Array> {
  image = ImageData.from(image)

  const e = supportedFormats['oxipng']
  const m = await e.enc()
  await maybeDelay()
  const r = await m.encode(image.data, image.width, image.height, {
    ...e.defaultEncoderOptions,
  })
  return Buffer.from(r)
}
