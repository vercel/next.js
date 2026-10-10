import type { Worker } from 'node:worker_threads'

export function startWorker(): Worker
export function startWorkerWithDefaultParam(file?: string): Worker
