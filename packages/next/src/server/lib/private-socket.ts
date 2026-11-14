import fs from 'fs'
import os from 'os'
import path from 'path'

// Platforms where private links use Unix sockets; everywhere else they use
// loopback TCP. macOS is off for now, open for discussion: its Unix sockets
// get 8 KiB buffers (sysctl net.local.stream.sendspace/recvspace, about
// 208 KiB on Linux), and in a benchmark a 64 KiB body written by Node cost
// 2-3x more CPU over the socket than over TCP, while small bodies were
// cheaper. Go can raise its own buffers; Node has no API to. Measure real
// pages over the socket on macOS before adding it. Windows can't be added:
// Node only speaks named pipes there, which Go's standard library can't serve.
const UNIX_SOCKET_PLATFORMS: ReadonlySet<NodeJS.Platform> = new Set(['linux'])

/**
 * Paths for Unix sockets between the processes Next.js runs together (the
 * front server, Node, `route.go` workers). They all live in one directory per
 * Node process, created on first use with `mkdtemp`, so mode 0700: other users
 * can't connect, unlike a loopback TCP port. The directory is removed when
 * this process exits.
 *
 * Returns undefined when a socket can't be used, and the caller then uses
 * loopback TCP: on platforms outside UNIX_SOCKET_PLATFORMS, when the
 * directory can't be created, or when the path doesn't fit in a socket
 * address.
 */
export function privateSocketPath(name: string): string | undefined {
  if (!UNIX_SOCKET_PLATFORMS.has(process.platform)) return undefined
  const dir = privateDir()
  if (dir === undefined) return undefined
  const socketPath = path.join(dir, name)
  // sun_path holds 104 bytes on macOS and the BSDs and 108 on Linux,
  // including the terminating NUL.
  const limit = process.platform === 'linux' ? 107 : 103
  return Buffer.byteLength(socketPath) <= limit ? socketPath : undefined
}

let dir: string | null | undefined

function privateDir(): string | undefined {
  if (dir === undefined) {
    try {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-'))
      const created = dir
      process.once('exit', () =>
        fs.rmSync(created, { recursive: true, force: true })
      )
    } catch {
      dir = null
    }
  }
  return dir ?? undefined
}
