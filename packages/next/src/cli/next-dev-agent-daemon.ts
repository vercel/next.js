import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import * as Log from '../build/output/log'
import { bold, cyan } from '../lib/picocolors'
import { readLockfileContent, parseDevServerInfo } from '../build/lockfile'

/**
 * Agent mode: `next dev` in the foreground blocks an agent's shell, so agents
 * wrap it in `(next dev > log &); sleep; cat log` and then poll blindly. When
 * an agent session is detected (and experimental.agentMode is on), we instead
 * detach the server and print a structured report of where it is and how to
 * query it — the report lands exactly where the agent is already looking
 * (this command's stdout, or the log file it redirected to).
 *
 * Opt out per-invocation with `next dev --foreground`. Never active under the
 * test harness (`__NEXT_TEST_MODE`), and the detached child runs with
 * `--foreground` plus `NEXT_PRIVATE_AGENT_DAEMON=1` so it cannot recurse.
 */

const READY_TIMEOUT_MS = 60_000
const READY_POLL_MS = 250

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Starts `next dev --foreground` detached and reports how to reach it.
 * Never returns: exits 0 once the server's lockfile appears, non-zero when
 * the child dies first or the lockfile never shows up.
 *
 * @param dir - project directory
 * @param distDir - phase-resolved relative distDir (e.g. `.next/dev`)
 */
export async function daemonizeDevServerForAgent(
  dir: string,
  distDir: string
): Promise<never> {
  const lockfilePath = path.join(dir, distDir, 'lock')

  // A live server for this project? Reuse-first, like the lockfile collision
  // message — without spawning a child just to watch it lose the lock race.
  const existingInfo = (() => {
    const content = readLockfileContent(lockfilePath)
    return content ? parseDevServerInfo(content) : undefined
  })()
  if (existingInfo && isPidAlive(existingInfo.pid)) {
    Log.warn(
      `A dev server for this project is already running at ${cyan(existingInfo.appUrl)} (PID ${existingInfo.pid}).`
    )
    console.log()
    console.log(`Reuse it instead of starting another:`)
    console.log(
      `- ${cyan('npx next devtools')}              server info + available tools`
    )
    console.log(
      `- ${cyan('npx next devtools get_errors')}   current build/runtime errors (JSON)`
    )
    console.log(`- JSON index: ${cyan(`${existingInfo.appUrl}/_next/agent`)}`)
    console.log()
    console.log(
      `To really start a fresh server, stop the old one first: ${cyan(`kill ${existingInfo.pid}`)}`
    )
    process.exit(1)
  }

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
      ...devArgsFromArgv(),
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

  const relativeLogPath = path.relative(dir, logPath)

  await new Promise<void>((resolve) => {
    const startedPolling = Date.now()
    const timer = setInterval(() => {
      if (childExit) {
        clearInterval(timer)
        Log.error(
          `next dev exited (code ${childExit.code}) before becoming ready. Last output from ${relativeLogPath}:`
        )
        try {
          const tail = fs
            .readFileSync(logPath, 'utf-8')
            .split('\n')
            .slice(-15)
            .join('\n')
          console.error(tail)
        } catch {}
        process.exit(childExit.code === 0 ? 1 : (childExit.code ?? 1))
      }

      const content = readLockfileContent(lockfilePath)
      const info = content ? parseDevServerInfo(content) : undefined
      // Only accept a lockfile written by this launch, not a stale leftover.
      if (info && info.startedAt >= launchedAt - 2_000) {
        clearInterval(timer)
        console.log()
        console.log(bold(`Agent session detected — next dev started detached.`))
        console.log()
        console.log(`- Local:    ${cyan(info.appUrl)}`)
        console.log(`- Project:  ${dir}`)
        console.log(`- PID:      ${info.pid}`)
        console.log(`- Log:      ${relativeLogPath}`)
        console.log()
        console.log(`Query it without fetching pages:`)
        console.log(
          `- ${cyan('npx next devtools')}              server info + available tools`
        )
        console.log(
          `- ${cyan('npx next devtools get_errors')}   current build/runtime errors (JSON)`
        )
        console.log(`- JSON index: ${cyan(`${info.appUrl}/_next/agent`)}`)
        console.log()
        console.log(
          `Stop: ${cyan(`kill ${info.pid}`)} · Run attached instead: ${cyan('next dev --foreground')}`
        )
        resolve()
        process.exit(0)
      }

      if (Date.now() - startedPolling > READY_TIMEOUT_MS) {
        clearInterval(timer)
        Log.error(
          `Timed out waiting for the dev server to become ready. It may still be starting; check ${relativeLogPath}.`
        )
        process.exit(1)
      }
    }, READY_POLL_MS)
  })
  throw new Error('unreachable')
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
