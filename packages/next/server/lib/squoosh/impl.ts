import { codecs as supportedFormats, preprocessors } from './codecs'
import ImageData, { ImageDataSerialized } from './image_data'

export async function decodeBuffer(
  dataBase64: string
): Promise<ImageDataSerialized> {
  const buffer = Buffer.from(dataBase64, 'base64')
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
  const obj = d.decode(new Uint8Array(buffer))
  return new ImageDataSerialized(obj)
}

export async function rotate(
  image: ImageDataSerialized,
  numRotations: number
): Promise<ImageDataSerialized> {
  const data = Buffer.from(image.dataBase64, 'base64')
  const m = await preprocessors['rotate'].instantiate()
  const img = await m(data, image.width, image.height, { numRotations })
  return new ImageDataSerialized(img)
}

type ResizeOpts = { image: ImageDataSerialized } & (
  | { width: number; height?: never }
  | { height: number; width?: never }
)

export async function resize({
  image,
  width,
  height,
}: ResizeOpts): Promise<ImageDataSerialized> {
  const data = Buffer.from(image.dataBase64, 'base64')
  const p = preprocessors['resize']
  const m = await p.instantiate()
  const img = await m(data, image.width, image.height, {
    ...p.defaultOptions,
    width,
    height,
  })
  return new ImageDataSerialized(img)
}

export async function encodeJpeg(
  image: ImageDataSerialized,
  { quality }: { quality: number }
): Promise<string> {
  const data = Buffer.from(image.dataBase64, 'base64')
  const e = supportedFormats['mozjpeg']
  const m = await e.enc()
  const r = await m.encode!(data, image.width, image.height, {
    ...e.defaultEncoderOptions,
    quality,
  })
  return Buffer.from(r).toString('base64')
}

export async function encodeWebp(
  image: ImageDataSerialized,
  { quality }: { quality: number }
): Promise<string> {
  const data = Buffer.from(image.dataBase64, 'base64')
  const e = supportedFormats['webp']
  const m = await e.enc()
  const r = await m.encode!(data, image.width, image.height, {
    ...e.defaultEncoderOptions,
    quality,
  })
  return Buffer.from(r).toString('base64')
}

export async function encodePng(image: ImageDataSerialized): Promise<string> {
  const data = Buffer.from(image.dataBase64, 'base64')
  const e = supportedFormats['oxipng']
  const m = await e.enc()
  const r = await m.encode(data, image.width, image.height, {
    ...e.defaultEncoderOptions,
  })
  return Buffer.from(r).toString('base64')
}
