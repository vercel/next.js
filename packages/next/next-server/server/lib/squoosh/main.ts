import { Worker } from 'jest-worker'
import * as path from 'path'
import { execOnce } from '../../../lib/utils'
import { cpus } from 'os'

type RotateOperation = {
  type: 'rotate'
  numRotations: number
}
type ResizeOperation = {
  type: 'resize'
} & ({ width: number; height?: never } | { height: number; width?: never })
export type Operation = RotateOperation | ResizeOperation
export type Encoding = 'jpeg' | 'png' | 'webp'

const getWorker = execOnce(
  () =>
    new Worker(path.resolve(__dirname, 'impl'), {
      enableWorkerThreads: true,
      // There will be at most 6 workers needed since each worker will take
      // at least 1 operation type.
      numWorkers: Math.max(1, Math.min(cpus().length - 1, 6)),
      computeWorkerKey: (method) => method,
    })
)

export async function processBuffer(
  buffer: Buffer,
  operations: Operation[],
  encoding: Encoding,
  quality: number
): Promise<Buffer> {
  const worker: typeof import('./impl') = getWorker() as any

  let imageData = await worker.decodeBuffer(buffer)
  for (const operation of operations) {
    if (operation.type === 'rotate') {
      imageData = await worker.rotate(imageData, operation.numRotations)
    } else if (operation.type === 'resize') {
      if (
        operation.width &&
        imageData.width &&
        imageData.width > operation.width
      ) {
        imageData = await worker.resize({
          image: imageData,
          width: operation.width,
        })
      } else if (
        operation.height &&
        imageData.height &&
        imageData.height > operation.height
      ) {
        imageData = await worker.resize({
          image: imageData,
          height: operation.height,
        })
      }
    }
  }

  switch (encoding) {
    case 'jpeg':
      return Buffer.from(await worker.encodeJpeg(imageData, { quality }))
    case 'webp':
      return Buffer.from(await worker.encodeWebp(imageData, { quality }))
    case 'png':
      return Buffer.from(await worker.encodePng(imageData))
    default:
      throw Error(`Unsupported encoding format`)
  }
}
