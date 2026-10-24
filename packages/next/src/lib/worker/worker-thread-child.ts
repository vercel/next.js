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
import { PARENT_MESSAGE_OK, PARENT_MESSAGE_CLIENT_ERROR } from './types'
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
    try {
      port.postMessage(message)
    } catch (err) {
      // worker_threads uses the structured clone algorithm. If the message
      // contains a non-clonable value (e.g. Symbol, function, certain class
      // instances), postMessage throws a DataCloneError.
      //
      // For PARENT_MESSAGE_OK (type 0) we have a requestId (message[1]) we can
      // use to send back a CLIENT_ERROR describing the serialization failure.
      // For all other message types there is no recovery path, so we re-throw
      // and let the worker crash (the parent will observe the exit).
      if (message[0] === PARENT_MESSAGE_OK) {
        const requestId = message[1] as number
        const e = err instanceof Error ? err : new Error(String(err))
        try {
          port.postMessage([
            PARENT_MESSAGE_CLIENT_ERROR,
            requestId,
            e.constructor?.name ?? 'Error',
            e.message,
            e.stack,
            {},
          ])
        } catch {
          // If even the error report can't be sent, give up and re-throw the
          // original error to crash the worker.
          throw err
        }
      } else {
        throw err
      }
    }
  },
  disconnect(): void {
    port.removeListener('message', listener)
    // Unlike child_process (which has process.disconnect() to close the IPC
    // channel and allow natural exit), worker_threads stay alive as long as
    // the parentPort ref is active. Call process.exit() so the thread
    // terminates and the parent's waitForExit() resolves without needing
    // the force-kill timeout.
    process.exit(0)
  },
}

const listener = createMessageHandler(transport)

port.on('message', listener as (message: ChildMessage) => void)
