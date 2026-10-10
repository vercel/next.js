import { Worker } from 'node:worker_threads'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function startWorker() {
  return new Worker(join(dirname(fileURLToPath(import.meta.url)), 'worker.cjs'))
}

export function startWorkerWithDefaultParam(file = 'worker.cjs') {
  return new Worker(join(dirname(fileURLToPath(import.meta.url)), file))
}
