import { codecs as supportedFormats, preprocessors } from './codecs'
import ImageData from './image_data'

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
  const r = await m.encode(image.data, image.width, image.height, {
    ...e.defaultEncoderOptions,
  })
  return Buffer.from(r)
}
