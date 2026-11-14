import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * Paths for Unix sockets between the processes Next.js runs together (the
 * front server, Node, `route.go` workers). They all live in one directory per
 * Node process, created on first use with `mkdtemp`, so mode 0700: other users
 * can't connect, unlike a loopback TCP port. The directory is removed when
 * this process exits.
 *
 * Returns undefined when a socket can't be used, and the caller then uses
 * loopback TCP: on Windows, where Node's `net` module only speaks named pipes
 * and Go's standard library only AF_UNIX; when the directory can't be
 * created; or when the path doesn't fit in a socket address.
 */
export function privateSocketPath(name: string): string | undefined {
  if (process.platform === 'win32') return undefined
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
