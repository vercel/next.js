import { codecs as supportedFormats, preprocessors } from './codecs'
import ImageData from './image_data'

export async function decodeBuffer(buffer: Buffer): Promise<ImageData> {
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
  const rgba = d.decode(new Uint8Array(buffer))
  return rgba
}

export async function rotate(
  image: ImageData,
  numRotations: number
): Promise<ImageData> {
  const m = await preprocessors['rotate'].instantiate()
  return await m(image.data, image.width, image.height, { numRotations })
}

export async function resize(image: ImageData, { width }: { width: number }) {
  const p = preprocessors['resize']
  const m = await p.instantiate()
  return await m(image.data, image.width, image.height, {
    ...p.defaultOptions,
    width,
  })
}

export async function encodeJpeg(
  image: ImageData,
  { quality }: { quality: number }
): Promise<Buffer> {
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
): Promise<Buffer> {
  const e = supportedFormats['webp']
  const m = await e.enc()
  const r = await m.encode!(image.data, image.width, image.height, {
    ...e.defaultEncoderOptions,
    quality,
  })
  return Buffer.from(r)
}

export async function encodePng(image: ImageData): Promise<Buffer> {
  const e = supportedFormats['oxipng']
  const m = await e.enc()
  const r = await m.encode(image.data, image.width, image.height, {
    ...e.defaultEncoderOptions,
  })
  return Buffer.from(r)
}
