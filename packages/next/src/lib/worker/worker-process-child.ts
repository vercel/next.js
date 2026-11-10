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

let disconnected = false

const transport: ChildTransport = {
  send(message: unknown[]): void {
    // Silently drop messages after disconnect. This can happen when an async
    // operation in the worker completes after the parent has sent END and the
    // IPC channel has been closed — attempting process.send() in that state
    // throws ERR_IPC_CHANNEL_CLOSED and pollutes the build output.
    if (disconnected) return
    if (!process.send) {
      throw new Error('Child can only be used on a forked process')
    }
    // Note: unlike worker_threads (which uses structured clone and throws
    // DataCloneError for non-clonable values), IPC uses JSON serialization.
    // Non-serializable values are silently coerced (symbols → undefined,
    // functions are dropped). No explicit error handling is needed here.
    process.send(message)
  },
  disconnect(): void {
    disconnected = true
    process.removeListener('message', listener)
    // Close the IPC channel, then exit right away (teardown has already run).
    // Waiting for a natural exit could take until the parent's force-kill
    // timeout, because leftover ref'd handles (timers, sockets, possibly from
    // user code) keep the process alive. process.exit() still runs 'exit'
    // handlers, so e.g. CPU profiles are saved.
    process.disconnect()
    process.exit(0)
  },
}

const listener = createMessageHandler(transport)

process.on('message', listener as (message: ChildMessage) => void)
