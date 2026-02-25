/**
 * Worker-thread entry point for the worker pool.
 *
 * This file is loaded by `new Worker(...)` (worker_threads). It creates a
 * transport that uses `parentPort.postMessage()` / `parentPort.on('message')`
 * and delegates all protocol handling to `createMessageHandler` from the
 * shared module.
 */
import { parentPort } from 'worker_threads'
import type { ChildMessage } from './types'
import {
  createMessageHandler,
  type ChildTransport,
} from './worker-child-common'

if (!parentPort) {
  throw new Error('This file must be run as a worker thread')
}

const port = parentPort

const transport: ChildTransport = {
  send(message: unknown[]): void {
    port.postMessage(message)
  },
  disconnect(): void {
    port.removeListener('message', listener)
  },
}

const listener = createMessageHandler(transport, (message) => {
  // Worker threads receive JEST_WORKER_ID via the INITIALIZE message
  if (message[4]) {
    process.env.JEST_WORKER_ID = message[4] as string
  }
})

port.on('message', listener as (message: ChildMessage) => void)
