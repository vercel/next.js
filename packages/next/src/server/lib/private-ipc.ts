import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import type { Server } from 'http'
import * as Log from '../../build/output/log'

/**
 * Unix sockets for the private links between the processes `next start` runs
 * together, such as Switchyard → Node. Every socket a Node process creates
 * lives in one directory, made on first use with `mkdtemp`, so its mode is
 * 0700 and other users can't connect, as they can to a loopback TCP port. The
 * directory is removed when the process exits.
 *
 * Unix sockets also skip the TCP stack, which both sides otherwise pay for on
 * every request. Callers keep loopback TCP as the fallback whenever
 * `privateSocketPath` returns undefined.
 */

// Platforms where private links use Unix sockets; everywhere else they use
// loopback TCP. macOS is off for now, open for discussion: its Unix sockets
// get 8 KiB buffers (sysctl net.local.stream.sendspace/recvspace, about
// 208 KiB on Linux), and in a benchmark a 64 KiB body written by Node cost
// 2-3x more CPU over the socket than over TCP, while small bodies were
// cheaper. Go can raise its own buffers; Node has no API to. Measure real
// pages over the socket on macOS before adding it. Windows can't be added:
// Node only speaks named pipes there, which Go's standard library can't serve.
export const UNIX_SOCKET_PLATFORMS: ReadonlySet<NodeJS.Platform> = new Set([
  'linux',
])

/**
 * Whether a Unix socket path fits in a socket address. `sun_path` holds 104
 * bytes on macOS and the BSDs and 108 on Linux, including the terminating
 * NUL; a longer path can't be bound at all.
 */
export function socketPathFits(
  socketPath: string,
  platform: NodeJS.Platform
): boolean {
  const limit = platform === 'linux' ? 107 : 103
  return Buffer.byteLength(socketPath) <= limit
}

/**
 * A path for a Unix socket called `name` in this process's private directory,
 * or undefined when a socket can't be used here: on platforms outside
 * UNIX_SOCKET_PLATFORMS, when the directory can't be created, or when the
 * path is too long for a socket address (a long TMPDIR).
 */
export function privateSocketPath(name: string): string | undefined {
  if (!UNIX_SOCKET_PLATFORMS.has(process.platform)) return undefined
  const dir = privateDir()
  if (dir === undefined) return undefined
  const socketPath = path.join(dir, name)
  return socketPathFits(socketPath, process.platform) ? socketPath : undefined
}

let dir: string | null | undefined

function privateDir(): string | undefined {
  if (dir === undefined) {
    try {
      const created = fs.mkdtempSync(path.join(os.tmpdir(), 'next-'))
      dir = created
      // Also runs on process.exit(), which next start's signal handlers
      // call. After a crash or SIGKILL the empty directory stays behind;
      // nothing reuses it, since every process gets a fresh one.
      process.once('exit', () =>
        fs.rmSync(created, { recursive: true, force: true })
      )
    } catch {
      dir = null
    }
  }
  return dir ?? undefined
}

/** A Unix socket that feeds an HTTP server, made by `listenOnPrivateSocket`. */
export type PrivateSocket = {
  path: string
  /** Stops accepting on the socket and removes its file. */
  close: () => Promise<void>
}

/**
 * Accepts connections on a private Unix socket called `name` and hands each
 * one to `server`, which then handles it exactly like a connection it accepted
 * on its own listener: keep-alive, header and request timeouts,
 * closeIdleConnections() and close() all apply. `server` keeps its own
 * listener, for instance on loopback TCP.
 *
 * Resolves to undefined when a socket can't be used here (see
 * `privateSocketPath`) or listening on it fails; the caller then uses
 * `server`'s own address.
 */
export async function listenOnPrivateSocket(
  server: Server,
  name: string
): Promise<PrivateSocket | undefined> {
  const socketPath = privateSocketPath(name)
  if (socketPath === undefined) return undefined
  const socketServer = net.createServer((socket) =>
    server.emit('connection', socket)
  )
  try {
    await new Promise<void>((resolve, reject) => {
      socketServer.once('error', reject)
      socketServer.listen(socketPath, () => {
        socketServer.off('error', reject)
        resolve()
      })
    })
  } catch {
    return undefined
  }
  // Accept errors (for example running out of file descriptors) go to the
  // listener, which keeps accepting; without a handler they would crash Node.
  socketServer.on('error', (err) => {
    Log.error('Private socket error')
    console.error(err)
  })
  return {
    path: socketPath,
    close: () =>
      new Promise<void>((resolve) =>
        socketServer.close(() => {
          fs.rmSync(socketPath, { force: true })
          resolve()
        })
      ),
  }
}
