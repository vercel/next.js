import { spawn } from 'child_process'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import readline from 'readline'
import type { Readable } from 'stream'
import setupDebug from 'next/dist/compiled/debug'
import * as Log from '../../build/output/log'
import {
  startServer,
  type PrivateServer,
  type PublicServer,
  type StartServerOptions,
  type StartServerResult,
} from './start-server'
import { findFrontBinary } from './front-binary'
import { FRONT_SERVER_ENV } from './front-server-env'
import { formatHostname } from './format-hostname'
import { printAndExit } from './utils'

const debug = setupDebug('next:front-server')

/**
 * `next start` with __NEXT_EXPERIMENTAL_FRONT_SERVER=1: a Go process
 * (src/server/front) owns the public port and forwards every request,
 * unchanged, to Node over a private Unix socket.
 *
 *   client ──► next-front :3000 ──► Node <tmpdir>/next-front-XXXXXX/node.sock
 *
 * Node also listens on 127.0.0.1:<OS-chosen>, for the requests it sends
 * itself (`__NEXT_PRIVATE_ORIGIN`), and the front uses that address if the
 * socket can't be created.
 *
 * Node is the parent. The front exits when Node closes its stdin, and Node
 * exits 1 if the front dies.
 */
export function isFrontServerEnabled(): boolean {
  return process.env[FRONT_SERVER_ENV] === '1'
}

export async function startFrontServer(
  options: StartServerOptions
): Promise<StartServerResult> {
  const binary = findFrontBinary({
    env: process.env,
    platform: process.platform,
    arch: process.arch,
    exists: fs.existsSync,
  })
  if ('error' in binary) {
    return printAndExit(binary.error, 1)
  }
  return startServer({
    ...options,
    hostname: '127.0.0.1',
    port: 0,
    // The OS could hand Node the public port when it is in its ephemeral
    // range; Node then binds again so the front can take it.
    avoidPort: options.port,
    // The front owns client keep-alive; Node's private listener keeps
    // Node's default.
    keepAliveTimeout: undefined,
    beforeStartLog: async (privateServer) =>
      spawnFront(binary.path, {
        hostname: options.hostname,
        port: options.port,
        upstream: await listenOnPrivateSocket(privateServer),
        // Every value the front uses comes from Node, so it has no defaults
        // of its own: client keep-alive as without the front (--keepAliveTimeout
        // or Node's), Node's header timeout, and a pool idle time a second
        // below Node's keep-alive, so the front never sends a request on a
        // connection Node is closing.
        idleTimeoutMs:
          options.keepAliveTimeout ?? privateServer.keepAliveTimeout,
        headerTimeoutMs: privateServer.headersTimeout,
        upstreamIdleMs: privateServer.keepAliveTimeout - 1000,
      }),
  })
}

function spawnFront(
  binary: string,
  options: {
    hostname: string | undefined
    port: number
    upstream: Upstream
    idleTimeoutMs: number
    headerTimeoutMs: number
    upstreamIdleMs: number
  }
): Promise<PublicServer> {
  const listen = `${options.hostname ? formatHostname(options.hostname) : ''}:${options.port}`
  const front = spawn(
    binary,
    [
      '--listen',
      listen,
      '--upstream',
      options.upstream.address,
      '--idle-timeout-ms',
      String(options.idleTimeoutMs),
      '--header-timeout-ms',
      String(options.headerTimeoutMs),
      '--upstream-idle-ms',
      String(options.upstreamIdleMs),
    ],
    {
      stdio: ['pipe', 'pipe', 'inherit'],
      // Its own process group: Ctrl+C reaches only Node, whose shutdown then
      // closes the front's stdin. Signals always go through Node's handlers,
      // including NEXT_MANUAL_SIG_HANDLE ones.
      detached: true,
    }
  )
  // Writes fail with EPIPE once the front has exited; its exit is handled below.
  front.stdin.on('error', () => {})

  const exited = new Promise<void>((resolve) =>
    front.once('exit', () => resolve())
  )
  let closing = false
  const close = async () => {
    closing = true
    front.stdin.end()
    await exited
    await options.upstream.close()
  }

  return new Promise<PublicServer>((resolve, reject) => {
    let ready = false
    front.once('error', (err) => {
      if (!ready) reject(err)
    })
    front.once('exit', (code, signal) => {
      if (!ready) {
        reject(
          new Error(
            `next-front exited before it was ready (${describeExit(code, signal)})`
          )
        )
      } else if (!closing) {
        Log.error(
          `next-front exited unexpectedly (${describeExit(code, signal)})`
        )
        process.exit(1)
      }
    })
    readFrontStdout(front.stdout, (port) => {
      ready = true
      resolve({ hostname: options.hostname, port, close })
    })
  })
}

/** Where the front reaches Node, as `--upstream` takes it. */
type Upstream = {
  address: string
  /** Stops accepting on it once the front has exited. */
  close: () => Promise<void>
}

/**
 * A Unix socket whose connections Node's HTTP server handles like the ones it
 * accepts itself, keep-alive and header timeouts included. Loopback TCP costs
 * the front and Node more CPU per request, and the socket's directory is
 * private to this user, unlike a loopback port. Falls back to the TCP
 * listener if the socket can't be created, for example when the temp path is
 * too long for a socket address.
 */
async function listenOnPrivateSocket(
  privateServer: PrivateServer
): Promise<Upstream> {
  const tcp: Upstream = {
    address: `127.0.0.1:${privateServer.port}`,
    close: async () => {},
  }
  let dir: string
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-front-'))
  } catch {
    return tcp
  }
  const remove = () => fs.rmSync(dir, { recursive: true, force: true })
  const socketPath = path.join(dir, 'node.sock')
  const socketServer = net.createServer((socket) =>
    privateServer.server.emit('connection', socket)
  )
  try {
    await new Promise<void>((resolve, reject) => {
      socketServer.once('error', reject)
      socketServer.listen(socketPath, () => {
        socketServer.off('error', reject)
        resolve()
      })
    })
  } catch (err) {
    debug('no private socket, using TCP: %s', err)
    remove()
    return tcp
  }
  // Also when Node exits without closing it.
  process.once('exit', remove)
  return {
    address: `unix:${socketPath}`,
    close: () =>
      new Promise<void>((resolve) =>
        socketServer.close(() => {
          remove()
          process.off('exit', remove)
          resolve()
        })
      ),
  }
}

/** Calls `onReady` with the port in `NEXT_FRONT_READY <port>`, and passes any other line on. */
function readFrontStdout(stdout: Readable, onReady: (port: number) => void) {
  const lines = readline.createInterface({ input: stdout })
  lines.on('line', (line) => {
    const match = /^NEXT_FRONT_READY (\d+)$/.exec(line)
    if (match) {
      onReady(Number(match[1]))
    } else {
      console.log(line)
    }
  })
}

function describeExit(code: number | null, signal: NodeJS.Signals | null) {
  return signal ? `signal ${signal}` : `code ${code}`
}
