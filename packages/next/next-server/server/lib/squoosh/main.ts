import { Worker } from 'jest-worker'
import * as path from 'path'
import { execOnce } from '../../../lib/utils'
import { Operation, Encoding } from './impl'

const getWorker = execOnce(
  () =>
    new Worker(path.resolve(__dirname, 'impl'), {
      enableWorkerThreads: true,
    })
)

export { Operation }

export async function processBuffer(
  buffer: Buffer,
  operations: Operation[],
  encoding: Encoding,
  quality: number
): Promise<Buffer> {
  const worker: typeof import('./impl') = getWorker() as any
  return Buffer.from(
    await worker.processBuffer(buffer, operations, encoding, quality)
  )
}
