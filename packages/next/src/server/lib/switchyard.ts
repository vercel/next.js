import { spawn } from 'child_process'
import fs from 'fs'
import { randomBytes } from 'crypto'
import readline from 'readline'
import type { Readable } from 'stream'
import setupDebug from 'next/dist/compiled/debug'
import * as Log from '../../build/output/log'
import {
  startServer,
  type PublicServer,
  type StartServerOptions,
  type StartServerResult,
} from './start-server'
import { findSwitchyardBinary } from './switchyard-binary'
import type { SwitchyardRouteTable } from './switchyard-route-table'
import { SWITCHYARD_ENV, SWITCHYARD_TOKEN_ENV } from './switchyard-env'
import { formatHostname } from './format-hostname'
import { printAndExit } from './utils'

// DEBUG=next:switchyard shows what Node tells Switchyard: whether it may
// route route.go requests directly (or why not), and each worker.
const debug = setupDebug('next:switchyard')

/**
 * `next start` with __NEXT_EXPERIMENTAL_SWITCHYARD=1: a Go process
 * (src/server/switchyard) owns the public port and forwards every request,
 * unchanged, to Node on a private loopback port.
 *
 *   client ──► switchyard :3000 ──► Node 127.0.0.1:<OS-chosen>
 *
 * Node is the parent. Switchyard exits when Node closes its stdin, and Node
 * exits 1 if Switchyard dies.
 */
export function isSwitchyardEnabled(): boolean {
  return process.env[SWITCHYARD_ENV] === '1'
}

export async function startSwitchyard(
  options: StartServerOptions
): Promise<StartServerResult> {
  const binary = findSwitchyardBinary({
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
  // Switchyard on the public port.
  const token = randomBytes(32).toString('hex')
  return startServer({
    ...options,
    hostname: '127.0.0.1',
    port: 0,
    // The OS could hand Node the public port when it is in its ephemeral
    // range; Node then binds again so Switchyard can take it.
    avoidPort: options.port,
    // Switchyard owns client keep-alive; the Node server keeps Node's
    // default.
    keepAliveTimeout: undefined,
    switchyardToken: token,
    // Start Switchyard: it takes the public port and forwards to
    // the Node server above.
    beforeStartLog: (privateServer) =>
      spawnSwitchyard(binary.path, {
        hostname: options.hostname,
        port: options.port,
        privatePort: privateServer.port,
        token,
        maxHeaderBytes: privateServer.maxHeaderSize,
        // Every value Switchyard uses comes from Node, so it has no defaults
        // of its own: client keep-alive as without Switchyard (--keepAliveTimeout
        // or Node's), Node's header and request timeouts, and a pool idle time
        // a second below Node's keep-alive, so Switchyard never sends a request
        // on a connection Node is closing.
        // Node ignores --keepAliveTimeout 0 and keeps its own value, so 0
        // falls back here too.
        idleTimeoutMs:
          options.keepAliveTimeout || privateServer.keepAliveTimeout,
        headerTimeoutMs: privateServer.headersTimeout,
        requestTimeoutMs: privateServer.requestTimeout,
        upstreamIdleMs: privateServer.keepAliveTimeout - 1000,
      }),
  })
}

function spawnSwitchyard(
  binary: string,
  options: {
    hostname: string | undefined
    port: number
    privatePort: number
    token: string
    maxHeaderBytes: number
    idleTimeoutMs: number
    headerTimeoutMs: number
    requestTimeoutMs: number
    upstreamIdleMs: number
  }
): Promise<PublicServer> {
  const listen = `${options.hostname ? formatHostname(options.hostname) : ''}:${options.port}`
  const switchyard = spawn(
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
      '--max-header-bytes',
      String(options.maxHeaderBytes),
    ],
    {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, [SWITCHYARD_TOKEN_ENV]: options.token },
      // Its own process group: Ctrl+C reaches only Node, whose shutdown then
      // closes Switchyard's stdin. Signals always go through Node's handlers,
      // including NEXT_MANUAL_SIG_HANDLE ones.
      detached: true,
    }
  )
  // Writes fail with EPIPE once Switchyard has exited; its exit is handled below.
  switchyard.stdin.on('error', () => {})

  const exited = new Promise<void>((resolve) =>
    switchyard.once('exit', () => resolve())
  )
  let closing = false
  const close = () => {
    closing = true
    switchyard.stdin.end()
    return exited
  }
  // Control messages to Switchyard, one JSON object per line on its stdin
  // (src/server/switchyard/control.go): the route table once the router has
  // loaded, then each route.go worker as Node starts or retires it.
  const send = (message: object) => {
    if (!closing) switchyard.stdin.write(JSON.stringify(message) + '\n')
  }
  const setRouteTable = (table: SwitchyardRouteTable) => {
    debug(
      'route table: %s',
      'reason' in table
        ? `every request goes to Node (${table.reason})`
        : `${Object.keys(table.goExact).length} route.go routes`
    )
    send({ event: 'table', table })
    // An app without direct routes has no use for its workers' addresses.
    if ('reason' in table) return
    const { observeNativeRouteWorkers } =
      require('./native-route.external') as typeof import('./native-route.external')
    observeNativeRouteWorkers((event) => {
      debug('route.go worker %s: %s', event.event, event.address)
      send(event)
    })
  }

  return new Promise<PublicServer>((resolve, reject) => {
    let ready = false
    switchyard.once('error', (err) => {
      if (!ready) reject(err)
    })
    switchyard.once('exit', (code, signal) => {
      if (!ready) {
        reject(
          new Error(
            `switchyard exited before it was ready (${describeExit(code, signal)})`
          )
        )
      } else if (!closing) {
        Log.error(
          `switchyard exited unexpectedly (${describeExit(code, signal)})`
        )
        process.exit(1)
      }
    })
    readSwitchyardStdout(switchyard.stdout, (port) => {
      ready = true
      resolve({ hostname: options.hostname, port, close, setRouteTable })
    })
  })
}

/** Calls `onReady` with the port in `NEXT_SWITCHYARD_READY <port>`, and passes any other line on. */
function readSwitchyardStdout(
  stdout: Readable,
  onReady: (port: number) => void
) {
  const lines = readline.createInterface({ input: stdout })
  lines.on('line', (line) => {
    const match = /^NEXT_SWITCHYARD_READY (\d+)$/.exec(line)
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
