import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

/** Set when `next build` runs a Go executable only to initialize it. */
export const NATIVE_ROUTE_STARTUP_CHECK_ENV = '__NEXT_GO_STARTUP_CHECK'

const STARTUP_CHECK_TIMEOUT_MS = 30_000
/** The most initialization output kept for the build error. */
const STARTUP_CHECK_MAX_STDERR_BYTES = 1024 * 1024
/** How long stderr is still read after the executable exits. */
const STDERR_GRACE_MS = 100

const OPT_OUT =
  'If route packages need runtime-only configuration while they initialize, or ' +
  'initialization has side effects, skip this check with ' +
  '`experimental.goRoutesStartupCheck: false` in next.config.'

/**
 * Production builds compile every route.go into one executable, so package
 * initialization for every route runs in one process. State that is harmless
 * in development, where each route has its own process, can then fail at
 * startup: two routes registering the same pattern on http.DefaultServeMux,
 * defining the same flag, or registering the same metric in a global
 * registry. Initialize each executable once, so such a failure fails the
 * build instead of every Go route in production.
 *
 * The executable exits after initialization, before it serves anything. It
 * runs with the build's environment, so `experimental.goRoutesStartupCheck:
 * false` turns the check off for routes whose initialization needs runtime
 * configuration or has side effects.
 */
export async function checkNativeRouteStartup(
  dir: string,
  distDir: string,
  entries: Iterable<string>,
  {
    timeoutMs = STARTUP_CHECK_TIMEOUT_MS,
    maxStderrBytes = STARTUP_CHECK_MAX_STDERR_BYTES,
  }: { timeoutMs?: number; maxStderrBytes?: number } = {}
): Promise<void> {
  const serverDir = path.join(distDir, 'server')
  const executables = new Set<string>()
  for (const entry of entries) {
    const descriptor = JSON.parse(
      await fs.readFile(path.join(serverDir, entry), 'utf8')
    )
    if (typeof descriptor?.executable !== 'string') {
      throw new Error(`Invalid native route descriptor ${entry}`)
    }
    executables.add(path.join(serverDir, descriptor.executable))
  }
  for (const executable of executables) {
    await initialize(executable, dir, timeoutMs, maxStderrBytes)
  }
}

function initialize(
  executable: string,
  cwd: string,
  timeoutMs: number,
  maxStderrBytes: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [], {
      // The project directory. `next start` spawns the executable without a
      // cwd, so there it runs from next start's working directory, normally
      // the project directory too (see the route.go docs).
      cwd,
      env: { ...process.env, [NATIVE_ROUTE_STARTUP_CHECK_ENV]: '1' },
      // Only stderr explains a failure; stdout is never read.
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    })
    const stderr: Buffer[] = []
    let stderrBytes = 0
    let stopped: 'timeout' | 'output' | undefined
    const stop = (reason: 'timeout' | 'output') => {
      if (stopped) return
      stopped = reason
      child.kill('SIGKILL')
    }
    const timer = setTimeout(() => stop('timeout'), timeoutMs)
    child.stderr!.on('data', (chunk: Buffer) => {
      if (stopped) return
      const room = maxStderrBytes - stderrBytes
      if (room > 0) stderr.push(chunk.subarray(0, room))
      stderrBytes += chunk.length
      if (stderrBytes > maxStderrBytes) stop('output')
    })
    const fail = (reason: string) => {
      const output = Buffer.concat(stderr).toString('utf8').trim()
      reject(
        new Error(
          `The Go Route Handler executable ${reason}. In production, every route.go ` +
            `runs in one process, so package initialization (init functions and ` +
            `package-level variables) of every route runs together, using the build ` +
            `environment during this check. ${OPT_OUT}` +
            (output ? `\n\n${output}` : '')
        )
      )
    }
    let settled = false
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fail(`could not be started (${error.message})`)
    })
    // The executable decides the outcome when it exits. A child it started
    // can inherit stderr and keep it open long after that, so read what is
    // already in the pipe for a moment, then stop reading.
    let exited:
      | { code: number | null; signal: NodeJS.Signals | null }
      | undefined
    let grace: NodeJS.Timeout | undefined
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      exited = { code, signal }
      grace = setTimeout(() => child.stderr!.destroy(), STDERR_GRACE_MS)
    })
    child.once('close', (closeCode, closeSignal) => {
      clearTimeout(grace)
      if (settled) return
      settled = true
      clearTimeout(timer)
      const { code, signal } = exited ?? {
        code: closeCode,
        signal: closeSignal,
      }
      if (stopped === 'timeout') {
        fail(`did not finish initializing within ${timeoutMs / 1000} seconds`)
      } else if (stopped === 'output') {
        fail(
          `wrote more than ${maxStderrBytes} bytes to stderr while initializing, ` +
            `so the check stopped it. The first ${maxStderrBytes} bytes follow`
        )
      } else if (code !== 0) {
        fail(
          `failed while initializing (${
            signal ? `signal ${signal}` : `exit code ${code}`
          })`
        )
      } else {
        resolve()
      }
    })
  })
}
