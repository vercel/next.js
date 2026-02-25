/**
 * Child-process entry point for the worker pool.
 *
 * This file is loaded by `child_process.fork()`. It creates a transport
 * that uses `process.send()` / `process.on('message')` and delegates all
 * protocol handling to `createMessageHandler` from the shared module.
 */
import type { ChildMessage } from './types'
import {
  createMessageHandler,
  type ChildTransport,
} from './worker-child-common'

const transport: ChildTransport = {
  send(message: unknown[]): void {
    if (!process.send) {
      throw new Error('Child can only be used on a forked process')
    }
    process.send(message)
  },
  disconnect(): void {
    process.removeListener('message', listener)
  },
}

const listener = createMessageHandler(transport)

process.on('message', listener as (message: ChildMessage) => void)
