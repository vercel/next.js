/**
 * Entry point of the fork server helper process (see `fork-server.ts`).
 *
 * It spawns worker processes on request and hands the parent ends of their
 * stdout, stderr and message pipes to the main process, so the main process
 * talks to the workers directly. It then only reports when workers exit.
 * It must stay small: it is started early so that spawning a worker never
 * forks the (potentially very large) main process.
 */
import { spawn } from 'child_process'
import type { Socket } from 'net'
import type {
  ForkServerRequest,
  ForkServerResponse,
  WorkerChannelName,
} from './fork-server'
import { FORK_SERVER_WORKER_ENV } from './types'

function send(message: ForkServerResponse, handle?: Socket): void {
  // The main process is gone if this fails; the 'disconnect' handler below
  // takes care of exiting.
  process.send!(message, handle, undefined, () => {})
}

function spawnWorker(
  request: Extract<ForkServerRequest, { type: 'spawn' }>
): void {
  const { id, modulePath, execArgv, cwd, env } = request
  let child
  try {
    child = spawn(process.execPath, [...execArgv, modulePath], {
      cwd,
      // Like `fork()` does: Node sets up its IPC channel (`process.send()`,
      // `process.on('message')`, ...) on fd 3 in the worker, and removes these
      // variables from its environment. The main process speaks the same
      // newline-delimited JSON on the other end of the pipe.
      env: {
        ...env,
        NODE_CHANNEL_FD: '3',
        NODE_CHANNEL_SERIALIZATION_MODE: 'json',
        [FORK_SERVER_WORKER_ENV]: '1',
      },
      // stdin is ignored like for silent `fork()` workers that don't read it;
      // fd 3 is the message pipe.
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    })
  } catch (error) {
    send({ type: 'error', id, ...serializeError(error) })
    return
  }

  child.on('error', (error) => {
    send({ type: 'error', id, ...serializeError(error) })
  })
  child.on('exit', (code, signal) => {
    send({ type: 'exit', id, code, signal })
  })

  if (child.pid === undefined) {
    // Spawning failed; the 'error' event reports why.
    return
  }

  send({ type: 'spawned', id, pid: child.pid })
  // All three are `net.Socket`s backed by pipes (`stdio: 'pipe'`).
  const channels: Array<[WorkerChannelName, unknown]> = [
    ['message', child.stdio[3]],
    ['stdout', child.stdout],
    ['stderr', child.stderr],
  ]
  for (const [channel, socket] of channels) {
    if (socket) {
      // Sending a handle closes this process's copy of it once it was sent.
      send({ type: 'channel', id, channel }, socket as Socket)
    }
  }
}

function serializeError(error: unknown): { message: string; code?: string } {
  const err = error as NodeJS.ErrnoException
  return { message: String(err?.message ?? err), code: err?.code }
}

process.on('message', (request: ForkServerRequest) => {
  switch (request.type) {
    case 'spawn':
      spawnWorker(request)
      break
    default:
      break
  }
})

// The main process exited or shut the fork server down. Workers keep running
// until they are told to end or their message pipe to the main process
// closes, so there is nothing left to do here.
process.on('disconnect', () => {
  process.exit(0)
})

send({ type: 'ready' })
