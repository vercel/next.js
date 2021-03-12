import Worker from 'jest-worker'
import * as path from 'path'
import os from 'os'
import { execOnce } from '../../../lib/utils'
import ImageData from './image_data'

const CORES = (os.cpus() || { length: 1 }).length

const getWorker = execOnce(
  () =>
    new Worker(path.resolve(__dirname, 'impl'), {
      enableWorkerThreads: true,
    })
)

// Jest-worker currently holds the latest execution's arguments and return
// value in its internal queue of every worker in the pool, due to some
// uncollected closures and references. This increases the memory use
// tremendously so we are calling the no-op method N times so each worker
// will replace the references of arguments and return value, which triggers
// the GC automatically to reduce memory usage.
function triggerWorkerGC() {
  const worker: typeof import('./impl') = getWorker() as any
  for (let i = 0; i < CORES; i++) {
    worker.noop()
  }
}

export async function decodeBuffer(buffer: Buffer): Promise<ImageData> {
  const worker: typeof import('./impl') = getWorker() as any
  const data = ImageData.from(await worker.decodeBuffer(buffer))
  triggerWorkerGC()
  return data
}

export async function rotate(
  image: ImageData,
  numRotations: number
): Promise<ImageData> {
  const worker: typeof import('./impl') = getWorker() as any
  const data = ImageData.from(await worker.rotate(image, numRotations))
  triggerWorkerGC()
  return data
}

export async function resize(
  image: ImageData,
  { width }: { width: number }
): Promise<ImageData> {
  const worker: typeof import('./impl') = getWorker() as any
  const data = ImageData.from(await worker.resize(image, { width }))
  triggerWorkerGC()
  return data
}

export async function encodeJpeg(
  image: ImageData,
  { quality }: { quality: number }
): Promise<Buffer> {
  const worker: typeof import('./impl') = getWorker() as any
  const o = await worker.encodeJpeg(image, { quality })
  const data = Buffer.from(o)
  triggerWorkerGC()
  return data
}

export async function encodeWebp(
  image: ImageData,
  { quality }: { quality: number }
): Promise<Buffer> {
  const worker: typeof import('./impl') = getWorker() as any
  const o = await worker.encodeWebp(image, { quality })
  const data = Buffer.from(o)
  triggerWorkerGC()
  return data
}

export async function encodePng(image: ImageData): Promise<Buffer> {
  const worker: typeof import('./impl') = getWorker() as any
  const o = await worker.encodePng(image)
  const data = Buffer.from(o)
  triggerWorkerGC()
  return data
}
