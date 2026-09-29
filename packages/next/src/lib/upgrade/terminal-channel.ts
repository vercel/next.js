import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { createConnection, createServer, type Socket } from 'node:net'
import { updateInitialEnv } from '@next/env'
import type { UpgradeContext } from './nudge'

const PORT_ENV = 'NEXT_PRIVATE_UPGRADE_TERMINAL_PORT'
const TOKEN_ENV = 'NEXT_PRIVATE_UPGRADE_TERMINAL_TOKEN'
// A stalled or invalid peer must not grow the pending input buffer forever.
const MAX_MESSAGE_LENGTH = 64 * 1024

export type UpgradeTerminalChildMessage =
  | {
      type: 'nudge'
      directory: string
      context: UpgradeContext
    }
  | {
      type: 'stopped'
      success: boolean
      error: string | null
    }

export type UpgradeTerminalParentMessage =
  | { type: 'stop' }
  | { type: 'continue' }

function receiveLines(
  socket: Socket,
  onMessage: (message: unknown) => void
): void {
  // Socket chunks can split or combine messages; newlines frame each JSON value.
  let pending = ''
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string) => {
    pending += chunk
    if (pending.length > MAX_MESSAGE_LENGTH) {
      socket.destroy(
        new Error('Upgrade terminal control message is too large.')
      )
      return
    }
    let newline: number
    while ((newline = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, newline)
      pending = pending.slice(newline + 1)
      try {
        onMessage(JSON.parse(line))
      } catch (error) {
        socket.destroy(
          error instanceof Error ? error : new Error(String(error))
        )
        return
      }
    }
  })
}

function send(socket: Socket, message: unknown): Promise<void> {
  if (socket.destroyed) {
    return Promise.reject(new Error('Upgrade terminal control channel closed.'))
  }
  return new Promise((resolve, reject) => {
    // Match receiveLines' framing; wait for the local write to complete before
    // the child exits after acknowledging stop.
    socket.write(`${JSON.stringify(message)}\n`, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

/**
 * Carry nudge and shutdown messages separately from PTY output so dev logs
 * cannot be mistaken for control messages. Listen on loopback and give the
 * spawned CLI a per-session token and port for its authenticated connection.
 */
export async function createUpgradeTerminalServer(
  onMessage: (message: UpgradeTerminalChildMessage) => void,
  onDisconnect: () => void,
  onError: (error: Error) => void
): Promise<{
  env: Record<string, string>
  send: (message: UpgradeTerminalParentMessage) => Promise<void>
  close: () => void
}> {
  // Only the child given this token may send nudges and shutdown results.
  const token = randomBytes(32).toString('hex')
  let client: Socket | null = null
  const server = createServer((socket) => {
    // The supervisor coordinates exactly one PTY child at a time.
    if (client) {
      socket.destroy()
      return
    }
    let authenticated = false
    socket.on('error', onError)
    socket.on('close', () => {
      if (client === socket) {
        client = null
        onDisconnect()
      }
    })
    receiveLines(socket, (message) => {
      // Reject control messages until the child proves it received our token.
      if (!authenticated) {
        if (
          !message ||
          typeof message !== 'object' ||
          !('type' in message) ||
          message.type !== 'hello' ||
          !('token' in message) ||
          message.token !== token
        ) {
          socket.destroy(new Error('Invalid upgrade terminal control token.'))
          return
        }
        authenticated = true
        client = socket
        return
      }
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        (message.type === 'nudge' || message.type === 'stopped')
      ) {
        onMessage(message as UpgradeTerminalChildMessage)
      } else {
        socket.destroy(new Error('Invalid upgrade terminal control message.'))
      }
    })
  })
  server.on('error', onError)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Could not start the upgrade terminal control channel.')
  }
  return {
    env: { [PORT_ENV]: String(address.port), [TOKEN_ENV]: token },
    send: (message) => {
      if (!client) {
        return Promise.reject(
          new Error('Upgrade terminal control channel is not connected.')
        )
      }
      return send(client, message)
    },
    close: () => {
      client?.destroy()
      server.close()
    },
  }
}

/**
 * Connect the PTY child to its supervisor so it can report a nudge and
 * acknowledge shutdown without pausing dev startup or build. Remove the connection
 * details from both environment snapshots before app workers are spawned.
 */
export async function connectUpgradeTerminalClient(
  onMessage: (message: UpgradeTerminalParentMessage) => void,
  onError: (error: Error) => void
): Promise<{
  send: (message: UpgradeTerminalChildMessage) => Promise<void>
  close: () => void
} | null> {
  const port = process.env[PORT_ENV]
  const token = process.env[TOKEN_ENV]
  if (!port || !token) {
    return null
  }
  // These values must not leak into the app worker via @next/env's snapshot.
  delete process.env[PORT_ENV]
  delete process.env[TOKEN_ENV]
  updateInitialEnv({ [PORT_ENV]: undefined, [TOKEN_ENV]: undefined })

  const socket = createConnection({ host: '127.0.0.1', port: Number(port) })
  await once(socket, 'connect')
  socket.on('error', onError)
  let closing = false
  socket.on('close', () => {
    if (!closing) {
      onError(new Error('Upgrade terminal supervisor disconnected.'))
    }
  })
  receiveLines(socket, (message) => {
    if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      (message.type === 'stop' || message.type === 'continue')
    ) {
      onMessage({ type: message.type })
    } else {
      socket.destroy(new Error('Invalid upgrade terminal control message.'))
    }
  })
  await send(socket, { type: 'hello', token })
  return {
    send: (message) => send(socket, message),
    close: () => {
      closing = true
      socket.destroy()
    },
  }
}
