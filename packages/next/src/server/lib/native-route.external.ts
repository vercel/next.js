import { spawn, type ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import { Agent, type IncomingMessage, type ServerResponse } from 'http'
import { join, relative, isAbsolute } from 'path'
import type { Readable } from 'stream'
import { proxyNativeRequest } from './native-route-proxy'
import { privateSocketPath } from './private-socket'

interface Worker {
  child: ChildProcess
  token: string
  /** Where the worker listens: a Unix socket path, or a loopback port. */
  address: { socketPath: string } | { port: number }
  agent: Agent
  active: number
  retired: boolean
  killTimer: ReturnType<typeof setTimeout> | undefined
}

/** Owns worker activation and lifetime, never compilation or filesystem watching. */
export class NativeRouteManager {
  private workers = new Map<string, Promise<Worker>>()
  private routes = new Map<string, string>()
  private executablePaths = new Map<string, string | Promise<string>>()
  private closed = false
  private activePages: ReadonlySet<string> | undefined
  private allWorkers = new Set<Worker>()
  private socketCount = 0

  constructor(
    private readonly distDir: string,
    private readonly dev: boolean
  ) {}

  private async readExecutable(entry: string): Promise<string> {
    const descriptor = JSON.parse(
      await fs.readFile(
        /* turbopackIgnore: true */ join(
          /* turbopackIgnore: true */ this.distDir,
          'server',
          entry
        ),
        'utf8'
      )
    )
    if (typeof descriptor?.executable !== 'string') {
      throw new Error('Invalid native route descriptor')
    }
    const goos = process.platform === 'win32' ? 'windows' : process.platform
    const goarch =
      process.arch === 'x64'
        ? 'amd64'
        : process.arch === 'ia32'
          ? '386'
          : process.arch
    if (descriptor.goos !== goos || descriptor.goarch !== goarch) {
      throw new Error(
        'Native route output was built for a different OS or architecture'
      )
    }
    const serverDir = join(/* turbopackIgnore: true */ this.distDir, 'server')
    const executable = join(
      /* turbopackIgnore: true */ serverDir,
      descriptor.executable
    )
    const localPath = relative(serverDir, executable)
    if (localPath.startsWith('..') || isAbsolute(localPath)) {
      throw new Error('Native route executable is outside the server output')
    }
    return executable
  }

  private async start(executable: string): Promise<Worker> {
    const token = randomBytes(32).toString('hex')
    // The worker listens on this socket when it can, and on a loopback port
    // otherwise; its readiness line says which.
    const socketPath = privateSocketPath(`go-${++this.socketCount}.sock`)
    const child = spawn(/* turbopackIgnore: true */ executable, [], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: {
        ...process.env,
        __NEXT_GO_TOKEN: token,
        ...(socketPath ? { __NEXT_GO_SOCKET: socketPath } : {}),
      },
      windowsHide: true,
    })
    const worker: Worker = {
      child,
      token,
      address: { port: 0 },
      agent: new Agent({ keepAlive: true }),
      active: 0,
      retired: false,
      killTimer: undefined,
    }
    try {
      worker.address = await new Promise<Worker['address']>(
        (resolve, reject) => {
          const ready = child.stdout as Readable
          const marker = Buffer.from(`\x1eNEXT_GO_READY:${token}:`)
          let message = Buffer.alloc(0)
          const timeout = setTimeout(() => {
            finish(
              new Error('Native route did not become ready within 10 seconds')
            )
          }, 10_000)
          const finish = (error?: Error, address?: Worker['address']) => {
            clearTimeout(timeout)
            ready.removeAllListeners()
            child.off('error', onError)
            child.off('exit', onExit)
            if (error) reject(error)
            else {
              ready.pipe(process.stdout, { end: false })
              resolve(address!)
            }
          }
          const onError = (error: Error) => finish(error)
          const onExit = () =>
            finish(new Error('Native route exited before readiness'))
          child.once('error', onError)
          child.once('exit', onExit)
          ready.on('error', onError)
          ready.on('data', (data: Buffer) => {
            message = Buffer.concat([message, data])
            const index = message.indexOf(marker)
            if (index < 0) {
              // Forward logs while retaining a possible partial readiness marker.
              const length = Math.max(0, message.length - marker.length + 1)
              process.stdout.write(message.subarray(0, length))
              message = message.subarray(length)
              return
            }
            process.stdout.write(message.subarray(0, index))
            message = message.subarray(index)
            const end = message.indexOf(10, marker.length)
            if (end < 0) {
              if (message.length > marker.length + 6)
                finish(new Error('Invalid native route readiness message'))
              return
            }
            // "unix" when it listens on the socket it was given, else its port.
            const value = message.subarray(marker.length, end).toString()
            const port = Number(value)
            let address: Worker['address']
            if (value === 'unix' && socketPath) {
              address = { socketPath }
            } else if (Number.isInteger(port) && port > 0 && port <= 65535) {
              address = { port }
            } else {
              finish(new Error('Invalid native route port'))
              return
            }
            process.stdout.write(message.subarray(end + 1))
            finish(undefined, address)
          })
        }
      )
    } catch (error) {
      child.kill()
      worker.agent.destroy()
      throw error
    }
    this.allWorkers.add(worker)
    child.on('error', (error) =>
      console.error('Native route process error:', error)
    )
    child.once('exit', () => {
      worker.retired = true
      worker.agent.destroy()
      clearTimeout(worker.killTimer)
      this.allWorkers.delete(worker)
      const pending = this.workers.get(executable)
      pending
        ?.then((current) => {
          if (current === worker && this.workers.get(executable) === pending)
            this.workers.delete(executable)
        })
        .catch(() => {})
    })
    if (this.closed) {
      this.retire(worker)
      throw new Error('Next.js server is closing')
    }
    return worker
  }

  private retire(worker: Worker) {
    worker.retired = true
    worker.killTimer ??= setTimeout(() => worker.child.kill('SIGKILL'), 21_000)
    worker.killTimer.unref()
    if (worker.active === 0) {
      worker.agent.destroy()
      worker.child.stdin?.end()
    }
  }

  async invoke(
    page: string,
    entry: string,
    req: IncomingMessage,
    res: ServerResponse,
    url: string
  ): Promise<void> {
    if (this.closed) throw new Error('Next.js server is closing')
    // Development output can change between requests; production output cannot.
    let executable = this.dev ? undefined : this.executablePaths.get(entry)
    if (!executable) {
      executable = this.readExecutable(entry)
      if (!this.dev) this.executablePaths.set(entry, executable)
    }
    if (typeof executable !== 'string') {
      const resolved = await executable
      if (!this.dev) this.executablePaths.set(entry, resolved)
      executable = resolved
    }
    if (this.closed) throw new Error('Next.js server is closing')
    if (this.activePages && !this.activePages.has(page)) {
      throw new Error('Native route was removed; retry the request')
    }
    const previous = this.routes.get(page)
    this.routes.set(page, executable)
    let pending = this.workers.get(executable)
    if (!pending) {
      pending = this.start(executable)
      this.workers.set(executable, pending)
      // Dev caches a broken generation until an edit. Production must recover from
      // transient spawn/readiness failures without requiring a server restart.
      pending.catch(() => {
        if (!this.dev && this.workers.get(executable) === pending) {
          this.workers.delete(executable)
        }
      })
    }
    const worker = await pending
    if (worker.retired) throw new Error('Native route process exited')
    if (this.routes.get(page) !== executable) {
      this.retire(worker)
      throw new Error(
        'Native route was superseded during startup; retry the request'
      )
    }
    if (previous && previous !== executable) {
      const old = this.workers.get(previous)
      this.workers.delete(previous)
      old?.then((value) => this.retire(value)).catch(() => {})
    }
    // Disconnects during descriptor resolution or startup predate the
    // transport listeners below. Do not dispatch those requests to Go.
    if (req.aborted || res.destroyed) return
    worker.active++
    try {
      await proxyNativeRequest(req, res, url, worker)
    } finally {
      worker.active--
      if (worker.retired) this.retire(worker)
    }
  }

  reconcile(pages: ReadonlySet<string>) {
    this.activePages = pages
    for (const [page, executable] of this.routes) {
      if (pages.has(page)) continue
      this.routes.delete(page)
      const worker = this.workers.get(executable)
      this.workers.delete(executable)
      worker?.then((value) => this.retire(value)).catch(() => {})
    }
  }

  async close(): Promise<void> {
    this.closed = true
    await Promise.allSettled(this.workers.values())
    await Promise.allSettled(
      [...this.allWorkers].map(async (worker) => {
        worker.retired = true
        worker.agent.destroy()
        worker.child.stdin?.end()
        if (worker.child.exitCode !== null) return
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => worker.child.kill('SIGKILL'), 21_000)
          worker.child.once('exit', () => {
            clearTimeout(timer)
            resolve()
          })
        })
      })
    )
    this.workers.clear()
    this.routes.clear()
    this.executablePaths.clear()
  }
}
