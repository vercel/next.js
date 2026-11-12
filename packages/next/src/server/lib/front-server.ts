import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import type { Readable } from 'stream'
import * as Log from '../../build/output/log'
import {
  startServer,
  type PublicServer,
  type StartServerOptions,
  type StartServerResult,
} from './start-server'
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
  return process.env.__NEXT_EXPERIMENTAL_FRONT_SERVER === '1'
}

export async function startFrontServer(
  options: StartServerOptions
): Promise<StartServerResult> {
  const binary = getFrontBinary()
  return startServer({
    ...options,
    hostname: '127.0.0.1',
    port: 0,
    // The OS could hand Node the public port when it is in its ephemeral
    // range; Node then binds again so the front can take it.
    avoidPort: options.port,
    // The front owns client keep-alive. Node keeps its default, which stays
    // above the front's 4 s idle connection timeout.
    keepAliveTimeout: undefined,
    beforeStartLog: (privatePort) =>
      spawnFront(binary, {
        hostname: options.hostname,
        port: options.port,
        privatePort,
        idleTimeoutMs: options.keepAliveTimeout ?? 5000,
      }),
  })
}

function getFrontBinary(): string {
  const goarch = getGoArch(process.arch)
  if (process.platform === 'win32') {
    printAndExit(
      '__NEXT_EXPERIMENTAL_FRONT_SERVER=1 is not supported on Windows yet.',
      1
    )
  }
  const binary = path.join(
    __dirname,
    '..',
    'front',
    `next-front-${process.platform}-${goarch ?? process.arch}`
  )
  if (!goarch || !fs.existsSync(binary)) {
    printAndExit(
      `__NEXT_EXPERIMENTAL_FRONT_SERVER=1 needs the next-front binary for ${process.platform}/${process.arch}, which is missing (expected ${binary}).`,
      1
    )
  }
  return binary
}

function getGoArch(arch: string): string | undefined {
  switch (arch) {
    case 'x64':
      return 'amd64'
    case 'arm64':
      return 'arm64'
    default:
      return undefined
  }
}

function spawnFront(
  binary: string,
  options: {
    hostname: string | undefined
    port: number
    privatePort: number
    idleTimeoutMs: number
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
