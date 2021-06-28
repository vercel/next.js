import ImageData from './image_data'
// @ts-ignore: TODO get TS types for squoosh
import { encoders, preprocessors } from '@squoosh/lib'

export async function decodeBuffer(buffer: Buffer): Promise<ImageData> {
  const firstChunk = buffer.slice(0, 16)
  const firstChunkString = Array.from(firstChunk)
    .map((v) => String.fromCodePoint(v))
    .join('')
  const key = Object.entries(encoders).find(([, val]) =>
    // @ts-ignore: TODO get TS types for squoosh
    val.detectors.some((detector) => detector.exec(firstChunkString))
  )?.[0]
  if (!key || !['mozjpeg', 'webp', 'oxipng'].includes(key)) {
    throw Error(`Buffer has an unsupported format`)
  }
  const d = await encoders[key].dec()
  return d.decode(Uint8ClampedArray.from(buffer))
}

export async function rotate(
  image: ImageData,
  numRotations: number
): Promise<ImageData> {
  const m = await preprocessors.rotate.instantiate()
  return await m(image.data, image.width, image.height, { numRotations })
}

type ResizeOpts = { image: ImageData } & (
  | { width: number; height?: never }
  | { height: number; width?: never }
)

export async function resize({ image, width, height }: ResizeOpts) {
  const p = preprocessors.resize
  const m = await p.instantiate()
  return await m(image.data, image.width, image.height, {
    ...p.defaultOptions,
    width,
    height,
  })
}

export async function encodeJpeg(
  image: ImageData,
  { quality }: { quality: number }
): Promise<Buffer> {
  const e = encoders.mozjpeg
  const m = await e.enc()
  const r = await m.encode(image.data, image.width, image.height, {
    ...e.defaultEncoderOptions,
    quality,
  })
  return Buffer.from(r)
}

export async function encodeWebp(
  image: ImageData,
  { quality }: { quality: number }
): Promise<Buffer> {
  const e = encoders.webp
  const m = await e.enc()
  const r = await m.encode(image.data, image.width, image.height, {
    ...e.defaultEncoderOptions,
    quality,
  })
  return Buffer.from(r)
}

export async function encodePng(image: ImageData): Promise<Buffer> {
  const e = encoders.oxipng
  const m = await e.enc()
  const r = await m.encode(image.data, image.width, image.height, {
    ...e.defaultEncoderOptions,
  })
  return Buffer.from(r)
}
