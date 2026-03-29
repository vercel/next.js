import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { once } from 'events'

export type ProjectGroup = {
  dir: string
  port?: number
  turbopack?: boolean
  webpack?: boolean
}

/**
 * Parses raw process.argv to find --experimental-project groups.
 * Each --experimental-project <dir> starts a new group; --port, --turbopack, --webpack
 * following it belong to that group until the next --experimental-project.
 */
export function parseProjectGroups(argv: string[]): ProjectGroup[] {
  const groups: ProjectGroup[] = []
  let current: ProjectGroup | null = null

  for (let i = 0; i < argv.length; i++) {
    const [mainFlag, mainEqVal] = argv[i].split('=', 2)
    if (mainFlag === '--experimental-project') {
      if (current) groups.push(current)
      const dir = mainEqVal ?? argv[++i]
      if (!dir || dir.startsWith('-')) {
        throw new Error('--experimental-project requires a directory argument')
      }
      current = { dir }
    } else if (current) {
      // Unknown flags between --experimental-project groups are intentionally ignored.
      // Each worker receives the full argv and handles its own flags.
      // Handle both --port 3000 and --port=3000 forms
      const [flag, eqVal] = argv[i].split('=', 2)
      if (flag === '--port' || flag === '-p') {
        const portStr = eqVal ?? argv[++i]
        const port = parseInt(portStr, 10)
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
          throw new Error(
            `--port requires a valid port number (0-65535), got: ${portStr}`
          )
        }
        current.port = port
      } else if (argv[i] === '--turbopack' || argv[i] === '--turbo') {
        current.turbopack = true
      } else if (argv[i] === '--webpack') {
        current.webpack = true
      }
    }
  }
  if (current) groups.push(current)
  return groups
}

/**
 * Generates a platform-appropriate socket path for this session.
 */
function generateSocketPath(): string {
  const id = crypto.randomBytes(8).toString('hex')
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\next-turbopack-${id}`
  }
  return path.join(os.tmpdir(), `next-turbopack-${id}.sock`)
}

/**
 * Spawns the daemon and waits until it signals readiness.
 * Readiness is indicated by the daemon writing "READY\n" to stdout.
 */
async function spawnDaemon(
  nextBin: string,
  socketPath: string
): Promise<ChildProcess> {
  const daemon = spawn(
    process.execPath,
    [nextBin, 'internal', 'turbopack-daemon', socketPath],
    {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: process.env,
    }
  )

  // Wait for daemon to emit "READY" on stdout, with a 30-second timeout.
  await new Promise<void>((resolve, reject) => {
    let buffer = ''
    const timeoutMs = 30_000

    const cleanup = () => {
      daemon.stdout!.off('data', onData)
      daemon.off('exit', onExit)
      daemon.off('error', onError)
      clearTimeout(timer)
    }

    const onData = (chunk: string) => {
      buffer += chunk
      if (buffer.includes('READY')) {
        cleanup()
        resolve()
      }
    }

    const onExit = (code: number | null) => {
      cleanup()
      reject(new Error(`Daemon exited early with code ${code}`))
    }

    const onError = (err: Error) => {
      cleanup()
      reject(err)
    }

    const timer = setTimeout(() => {
      cleanup()
      daemon.kill('SIGKILL')
      reject(
        new Error(
          `Turbopack daemon did not become ready within ${timeoutMs / 1000}s`
        )
      )
    }, timeoutMs)
    timer.unref()

    daemon.stdout!.setEncoding('utf8')
    daemon.stdout!.on('data', onData)
    daemon.on('exit', onExit)
    daemon.on('error', onError)
  })

  return daemon
}

/**
 * Spawns a single Next.js worker process for one project.
 */
function spawnWorker(
  nextBin: string,
  command: 'dev' | 'build',
  group: ProjectGroup,
  socketPath: string
): ChildProcess {
  const args = [nextBin, command, group.dir]

  if (group.port != null) {
    args.push('--port', String(group.port))
  }
  if (group.turbopack) {
    args.push('--turbopack')
  } else if (group.webpack) {
    args.push('--webpack')
  }
  // Always pass the daemon socket; webpack-mode workers simply ignore it
  args.push('--turbopack-daemon', socketPath)

  return spawn(process.execPath, args, {
    stdio: 'inherit',
    env: process.env,
  })
}

/**
 * Main orchestration entry point for multi-project mode.
 */
export async function runMultiProject(
  command: 'dev' | 'build',
  projects: ProjectGroup[]
): Promise<void> {
  const nextBin = require.resolve('next/dist/bin/next')
  const socketPath = generateSocketPath()

  // 1. Spawn daemon
  const daemon = await spawnDaemon(nextBin, socketPath)

  // Track workers so the daemon crash handler can kill them
  const workers: ChildProcess[] = []

  // If the daemon crashes unexpectedly, kill all workers
  daemon.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(
        `Turbopack daemon exited unexpectedly (code ${code}, signal ${signal}), killing workers`
      )
      workers.forEach((w) => {
        if (!w.killed) w.kill('SIGTERM')
      })
    }
  })

  // 2. Spawn one worker per project
  workers.push(
    ...projects.map((group) => spawnWorker(nextBin, command, group, socketPath))
  )

  const cleanupSocket = () => {
    if (process.platform !== 'win32') {
      try {
        fs.unlinkSync(socketPath)
      } catch (err: unknown) {
        // Ignore ENOENT — daemon may have already removed the socket
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }
    }
  }

  // Best-effort cleanup on unexpected exit
  process.on('exit', () => {
    // Best-effort cleanup — exit handlers must not throw
    try {
      cleanupSocket()
    } catch {
      // Ignore all errors at exit time
    }
  })

  // 3. Forward signals to daemon + all workers
  const forwardSignal = (signal: NodeJS.Signals) => {
    if (!daemon.killed) daemon.kill(signal)
    workers.forEach((w) => {
      if (!w.killed) w.kill(signal)
    })
    // Force exit after 5 seconds if children don't terminate
    setTimeout(() => {
      if (!daemon.killed) daemon.kill('SIGKILL')
      workers.forEach((w) => {
        if (!w.killed) w.kill('SIGKILL')
      })
      const exitCodes: Record<string, number> = {
        SIGINT: 130,
        SIGTERM: 143,
        SIGHUP: 129,
      }
      process.exit(exitCodes[signal] ?? 143)
    }, 5000).unref()
  }
  process.on('SIGINT', () => forwardSignal('SIGINT'))
  process.on('SIGTERM', () => forwardSignal('SIGTERM'))
  process.on('SIGHUP', () => forwardSignal('SIGHUP'))

  // 4. Wait for all workers to exit, then kill daemon
  await Promise.allSettled(workers.map((w) => once(w, 'exit')))

  // Cleanup: kill daemon and socket file.
  // On Windows, named pipes are automatically cleaned up by the OS.
  daemon.kill('SIGTERM')
  cleanupSocket()
  process.exit(0)
}
