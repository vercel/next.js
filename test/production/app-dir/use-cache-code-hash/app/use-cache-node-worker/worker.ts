import { parentPort } from 'node:worker_threads'

parentPort.postMessage('node-worker-v1')
