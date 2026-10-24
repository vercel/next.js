import { Worker } from 'node:worker_threads'

declare function startWorker(name?: string): Worker

export { startWorker }
