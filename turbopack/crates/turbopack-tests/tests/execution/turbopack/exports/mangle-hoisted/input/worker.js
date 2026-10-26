import { parentPort } from 'node:worker_threads'

parentPort.postMessage('flat-exports-worker')
