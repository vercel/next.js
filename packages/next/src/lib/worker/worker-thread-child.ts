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
    // worker_threads uses the structured clone algorithm, which throws a
    // DataCloneError for a non-clonable value (e.g. a function). The shared
    // message handler turns that into an error for the affected call.
    port.postMessage(message)
  },
  disconnect(): void {
    port.removeListener('message', listener)
    // Like the child_process entry, exit explicitly: worker_threads stay
    // alive as long as the parentPort ref (or any other ref'd handle) is
    // active. Call process.exit() so the thread terminates and the parent's
    // waitForExit() resolves without needing the force-kill timeout.
    process.exit(0)
  },
}

const listener = createMessageHandler(transport)

port.on('message', listener as (message: ChildMessage) => void)
