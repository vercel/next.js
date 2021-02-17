import JestWorker from 'jest-worker'
import * as path from 'path'
import { execOnce } from '../../../lib/utils'
import ImageData from './image_data'

const getWorker = execOnce(
  () => new JestWorker(path.resolve(__dirname, 'impl'))
)

export async function decodeBuffer(buffer: Buffer): Promise<ImageData> {
  const worker: typeof import('./impl') = getWorker() as any
  return await worker.decodeBuffer(buffer)
}

export async function rotate(
  image: ImageData,
  numRotations: number
): Promise<ImageData> {
  const worker: typeof import('./impl') = getWorker() as any
  return await worker.rotate(image, numRotations)
}

export async function resize(image: ImageData, { width }: { width: number }) {
  const worker: typeof import('./impl') = getWorker() as any
  return await worker.resize(image, { width })
}

export async function encodeJpeg(
  image: ImageData,
  { quality }: { quality: number }
): Promise<Buffer> {
  const worker: typeof import('./impl') = getWorker() as any
  return await worker.encodeJpeg(image, { quality })
}

export async function encodeWebp(
  image: ImageData,
  { quality }: { quality: number }
): Promise<Buffer> {
  const worker: typeof import('./impl') = getWorker() as any
  return await worker.encodeWebp(image, { quality })
}

export async function encodePng(image: ImageData): Promise<Buffer> {
  const worker: typeof import('./impl') = getWorker() as any
  return await worker.encodePng(image)
}
