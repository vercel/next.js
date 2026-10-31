import { Worker } from 'node:worker_threads'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function startWorker() {
  return new Worker(join(dirname(fileURLToPath(import.meta.url)), 'worker.cjs'))
}

export function startWorkerWithDefault(file = 'worker.cjs') {
  return new Worker(join(dirname(fileURLToPath(import.meta.url)), file))
}

export function startWorkerFromUrl() {
  return new Worker(new URL('./worker.cjs', import.meta.url))
}
