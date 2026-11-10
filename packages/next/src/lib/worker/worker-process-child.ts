/**
 * Child-process entry point for the worker pool.
 *
 * This file is loaded by `child_process.fork()`, or spawned by the fork server
 * (see `fork-server.ts`). It creates a transport over the parent's channel —
 * Node's IPC channel (`process.send()` / `process.on('message')`) when forked,
 * or the message pipe passed by the fork server — and delegates all protocol
 * handling to `createMessageHandler` from the shared module.
 */
import { Socket } from 'net'
import type { ChildMessage } from './types'
import {
  createMessageHandler,
  type ChildTransport,
} from './worker-child-common'
import { WORKER_CHANNEL_FD_ENV } from './fork-server'
import { readJsonLines, writeJsonLine } from './json-line-channel'

let disconnected = false

const channelFd = process.env[WORKER_CHANNEL_FD_ENV]
// Don't leak the fd to processes spawned by user code.
delete process.env[WORKER_CHANNEL_FD_ENV]

if (channelFd !== undefined) {
  const socket = new Socket({
    fd: Number(channelFd),
    readable: true,
    writable: true,
  })

  const transport: ChildTransport = {
    send(message: unknown[]): void {
      // See the IPC transport below for why messages are dropped after
      // disconnecting.
      if (disconnected) return
      writeJsonLine(socket, message)
    },
    disconnect(): void {
      disconnected = true
      // Flush pending messages, then exit right away like the IPC transport.
      socket.end(() => process.exit(0))
    },
  }

  const listener = createMessageHandler(transport)
  readJsonLines(socket, (message) => listener(message as ChildMessage))
  socket.on('error', () => {})
  // The main process is gone (or dropped this worker). Nothing can be
  // reported anymore, so exit instead of lingering as an orphan.
  socket.on('end', () => {
    if (!disconnected) process.exit(0)
  })
} else {
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
}
