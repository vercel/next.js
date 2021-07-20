import semver from 'next/dist/compiled/semver'
import { codecs as supportedFormats, preprocessors } from './codecs'
import ImageData from './image_data'

// Fixed in Node.js 16.5.0 and newer.
// See https://github.com/nodejs/node/pull/39337
// Eventually, remove this delay when engines is updated.
// See https://git.io/JCTr0
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
  )?.[0] as keyof typeof supportedFormats
  if (!key) {
    throw Error(`Buffer has an unsupported format`)
  }
  const d = await supportedFormats[key].dec()
  return d.decode(new Uint8Array(buffer))
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
  const r = await m.encode!(image.data, image.width, image.height, {
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
  const r = await m.encode!(image.data, image.width, image.height, {
    ...e.defaultEncoderOptions,
    quality,
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
