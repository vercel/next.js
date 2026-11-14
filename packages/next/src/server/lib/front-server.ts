import { spawn } from 'child_process'
import fs from 'fs'
import readline from 'readline'
import type { Readable } from 'stream'
import * as Log from '../../build/output/log'
import {
  startServer,
  type PublicServer,
  type StartServerOptions,
  type StartServerResult,
} from './start-server'
import { findFrontBinary } from './front-binary'
import { FRONT_SERVER_ENV } from './front-server-env'
import { formatHostname } from './format-hostname'
import { printAndExit } from './utils'

/**
 * `next start` with __NEXT_EXPERIMENTAL_FRONT_SERVER=1: a Go process
 * (src/server/front) owns the public port and forwards every request,
 * unchanged, to Node on a private loopback port.
 *
 *   client ──► next-front :3000 ──► Node 127.0.0.1:<OS-chosen>
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
  // Start the Node server, on a private loopback port instead of the public
  // one. Once it listens, startServer calls beforeStartLog below, which starts
  // the Go front server on the public port.
  return startServer({
    ...options,
    hostname: '127.0.0.1',
    port: 0,
    // The OS could hand Node the public port when it is in its ephemeral
    // range; Node then binds again so the front can take it.
    avoidPort: options.port,
    // The front server owns client keep-alive; the Node server keeps Node's
    // default.
    keepAliveTimeout: undefined,
    // Start the Go front server: it takes the public port and forwards to
    // the Node server above.
    beforeStartLog: (privateServer) =>
      spawnFront(binary.path, {
        hostname: options.hostname,
        port: options.port,
        privatePort: privateServer.port,
        // Every value the front uses comes from Node, so it has no defaults
        // of its own: client keep-alive as without the front (--keepAliveTimeout
        // or Node's), Node's header and request timeouts, and a pool idle time
        // a second below Node's keep-alive, so the front never sends a request
        // on a connection Node is closing.
        idleTimeoutMs:
          options.keepAliveTimeout ?? privateServer.keepAliveTimeout,
        headerTimeoutMs: privateServer.headersTimeout,
        requestTimeoutMs: privateServer.requestTimeout,
        upstreamIdleMs: privateServer.keepAliveTimeout - 1000,
      }),
  })
}

function spawnFront(
  binary: string,
  options: {
    hostname: string | undefined
    port: number
    privatePort: number
    idleTimeoutMs: number
    headerTimeoutMs: number
    requestTimeoutMs: number
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
      `127.0.0.1:${options.privatePort}`,
      '--idle-timeout-ms',
      String(options.idleTimeoutMs),
      '--header-timeout-ms',
      String(options.headerTimeoutMs),
      '--request-timeout-ms',
      String(options.requestTimeoutMs),
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
  const close = () => {
    closing = true
    front.stdin.end()
    return exited
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
