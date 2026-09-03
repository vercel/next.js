import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import * as Log from '../build/output/log'
import { bold, cyan } from '../lib/picocolors'
import {
  readLockfileContent,
  parseDevServerInfo,
  type DevServerInfo,
} from '../build/lockfile'

/**
 * Agent mode: `next dev` in the foreground blocks an agent's shell, so agents
 * wrap it in `(next dev > log &); sleep; cat log` and then poll blindly. When
 * an agent session is detected (and experimental.agentMode is on), we instead
 * detach the server and print a structured report of where it is and how to
 * query it — the report lands exactly where the agent is already looking
 * (this command's stdout, or the log file it redirected to).
 *
 * The same detached-start is exposed explicitly as
 * `next experimental-agent-dev start`, and its tool calls auto-start a server
 * via `spawnDetachedDevServer` when none is running.
 *
 * Opt out per-invocation with `next dev --foreground`. Never active under the
 * test harness (`__NEXT_TEST_MODE`), and the detached child runs with
 * `--foreground` plus `NEXT_PRIVATE_AGENT_DAEMON=1` so it cannot recurse.
 */

const READY_TIMEOUT_MS = 60_000
const READY_POLL_MS = 250

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function readDevServerInfo(
  lockfilePath: string
): DevServerInfo | undefined {
  const content = readLockfileContent(lockfilePath)
  return content ? parseDevServerInfo(content) : undefined
}

export class DetachedDevServerError extends Error {
  logPath: string
  constructor(message: string, logPath: string) {
    super(message)
    this.logPath = logPath
  }
}

/**
 * Spawns `next dev --foreground [devArgs]` detached, waits for the server's
 * lockfile to prove it is up, and resolves with the running server's info.
 * Rejects with `DetachedDevServerError` when the child exits first or the
 * lockfile never appears.
 *
 * @param dir - project directory
 * @param distDir - phase-resolved relative distDir (e.g. `.next/dev`)
 * @param devArgs - CLI args for the child `next dev` (defaults to this
 *   process's own argv, for the `next dev` interception path)
 */
export function spawnDetachedDevServer(
  dir: string,
  distDir: string,
  devArgs?: string[]
): Promise<DevServerInfo> {
  const lockfilePath = path.join(dir, distDir, 'lock')
  const logDir = path.join(dir, distDir, 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  const logPath = path.join(logDir, 'agent-daemon.log')
  const logFd = fs.openSync(logPath, 'a')

  const launchedAt = Date.now()
  const child = spawn(
    process.execPath,
    [
      ...process.execArgv,
      process.argv[1],
      'dev',
      ...(devArgs ?? devArgsFromArgv()),
      '--foreground',
    ],
    {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: process.cwd(),
      env: { ...process.env, NEXT_PRIVATE_AGENT_DAEMON: '1' },
    }
  )

  let childExit: { code: number | null } | undefined
  child.on('exit', (code) => {
    childExit = { code }
  })
  child.unref()

  return new Promise<DevServerInfo>((resolve, reject) => {
    const startedPolling = Date.now()
    const timer = setInterval(() => {
      if (childExit) {
        clearInterval(timer)
        let tail = ''
        try {
          tail = fs
            .readFileSync(logPath, 'utf-8')
            .split('\n')
            .slice(-15)
            .join('\n')
        } catch {}
        reject(
          new DetachedDevServerError(
            `next dev exited (code ${childExit.code}) before becoming ready.` +
              (tail ? `\nLast output:\n${tail}` : ''),
            logPath
          )
        )
        return
      }

      const info = readDevServerInfo(lockfilePath)
      // Only accept a lockfile written by this launch, not a stale leftover.
      if (info && info.startedAt >= launchedAt - 2_000) {
        clearInterval(timer)
        resolve(info)
        return
      }

      if (Date.now() - startedPolling > READY_TIMEOUT_MS) {
        clearInterval(timer)
        reject(
          new DetachedDevServerError(
            `Timed out waiting for the dev server to become ready. It may still be starting; check ${logPath}.`,
            logPath
          )
        )
      }
    }, READY_POLL_MS)
  })
}

/**
 * Prints the reuse-first block for an already-running server.
 */
export function printReuseRunningServer(info: DevServerInfo): void {
  Log.warn(
    `A dev server for this project is already running at ${cyan(info.appUrl)} (PID ${info.pid}).`
  )
  console.log()
  console.log(`Reuse it instead of starting another:`)
  console.log(
    `- ${cyan('npx next experimental-agent-dev')}              server info + available tools`
  )
  console.log(
    `- ${cyan('npx next experimental-agent-dev get_errors')}   current build/runtime errors (JSON)`
  )
  console.log(
    `- ${cyan('npx next experimental-agent-dev log')}          recent server output`
  )
  console.log(`- JSON index: ${cyan(`${info.appUrl}/_next/agent`)}`)
  console.log()
  console.log(
    `To really start a fresh server, stop this one first: ${cyan('npx next experimental-agent-dev stop')}`
  )
}

/**
 * Prints the post-start report for a freshly detached server.
 */
export function printDetachedReport(
  info: DevServerInfo,
  dir: string,
  distDir: string
): void {
  const relativeLogPath = path.join(distDir, 'logs', 'agent-daemon.log')
  console.log()
  console.log(
    bold(
      `Agent session detected — dev server started in the background (= next experimental-agent-dev start).`
    )
  )
  console.log()
  console.log(`- Local:    ${cyan(info.appUrl)}`)
  console.log(`- Project:  ${dir}`)
  console.log(`- PID:      ${info.pid}`)
  console.log(`- Log:      ${relativeLogPath}`)
  console.log()
  console.log(`Query it without fetching pages:`)
  console.log(
    `- ${cyan('npx next experimental-agent-dev')}              server info + available tools`
  )
  console.log(
    `- ${cyan('npx next experimental-agent-dev get_errors')}   current build/runtime errors (JSON)`
  )
  console.log(
    `- ${cyan('npx next experimental-agent-dev log')}          recent server output`
  )
  console.log(`- JSON index: ${cyan(`${info.appUrl}/_next/agent`)}`)
  console.log()
  console.log(
    `Stop: ${cyan('npx next experimental-agent-dev stop')} · Attached mode: ${cyan('next dev --foreground')} · Explore: ${cyan('npx next experimental-agent-dev --help')}`
  )
}

/**
 * The `next dev` interception path: reuse a running server or start one
 * detached, print the report, and exit. Never returns.
 */
export async function daemonizeDevServerForAgent(
  dir: string,
  distDir: string,
  devArgs?: string[]
): Promise<never> {
  const lockfilePath = path.join(dir, distDir, 'lock')

  // A live server for this project? Reuse-first, like the lockfile collision
  // message — without spawning a child just to watch it lose the lock race.
  const existingInfo = readDevServerInfo(lockfilePath)
  if (existingInfo && isPidAlive(existingInfo.pid)) {
    printReuseRunningServer(existingInfo)
    process.exit(1)
  }

  try {
    const info = await spawnDetachedDevServer(dir, distDir, devArgs)
    printDetachedReport(info, dir, distDir)
    process.exit(0)
  } catch (error) {
    if (error instanceof DetachedDevServerError) {
      Log.error(error.message)
      process.exit(1)
    }
    throw error
  }
}

/**
 * Re-derive the `next dev` CLI args for the detached child from our own argv.
 * `next dev` is commander's default command, so argv may or may not contain
 * the literal `dev` — strip it when present, keep everything else verbatim.
 */
function devArgsFromArgv(): string[] {
  const args = process.argv.slice(2)
  if (args[0] === 'dev') return args.slice(1)
  return args
}
