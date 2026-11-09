import { spawn, type ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import { Agent, request, type IncomingMessage, type ServerResponse } from 'http'
import { join, relative, isAbsolute } from 'path'
import { Readable } from 'stream'
import { proxyNativeRequest } from './native-route-proxy'

interface Worker {
  child: ChildProcess
  token: string
  port: number
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
    const child = spawn(/* turbopackIgnore: true */ executable, [], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, __NEXT_GO_TOKEN: token },
      windowsHide: true,
    })
    const worker: Worker = {
      child,
      token,
      port: 0,
      agent: new Agent({ keepAlive: true }),
      active: 0,
      retired: false,
      killTimer: undefined,
    }
    try {
      worker.port = await new Promise<number>((resolve, reject) => {
        const ready = child.stdout as Readable
        const marker = Buffer.from(`\x1eNEXT_GO_READY:${token}:`)
        let message = Buffer.alloc(0)
        const timeout = setTimeout(() => {
          finish(
            new Error('Native route did not become ready within 10 seconds')
          )
        }, 10_000)
        const finish = (error?: Error, port?: number) => {
          clearTimeout(timeout)
          ready.removeAllListeners()
          child.off('error', onError)
          child.off('exit', onExit)
          if (error) reject(error)
          else {
            ready.pipe(process.stdout, { end: false })
            resolve(port!)
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
          const port = Number(message.subarray(marker.length, end).toString())
          if (!Number.isInteger(port) || port <= 0 || port > 65535) {
            finish(new Error('Invalid native route port'))
            return
          }
          process.stdout.write(message.subarray(end + 1))
          finish(undefined, port)
        })
      })
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

  private async getWorker(page: string, entry: string): Promise<Worker> {
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
    return worker
  }

  async invoke(
    page: string,
    entry: string,
    req: IncomingMessage,
    res: ServerResponse,
    url: string
  ): Promise<void> {
    const worker = await this.getWorker(page, entry)
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

  /** Return a response to Next's middleware adapter without finishing the client response. */
  async invokeMiddleware(entry: string, req: Request): Promise<Response> {
    req.signal.throwIfAborted()
    const worker = await this.getWorker('/_middleware', entry)
    req.signal.throwIfAborted()
    const url = new URL(req.url)
    const headers: Record<string, string> = Object.create(null)
    req.headers.forEach((value, name) => {
      if (
        !name.startsWith('x-next-internal-go-') &&
        ![
          'connection',
          'transfer-encoding',
          'content-length',
          'keep-alive',
          'expect',
        ].includes(name)
      )
        headers[name] = value
    })
    headers.host = url.host
    headers['x-forwarded-proto'] = url.protocol.slice(0, -1)
    headers['x-next-internal-go-token'] = worker.token
    worker.active++
    return new Promise<Response>((resolve, reject) => {
      const upstream = request({
        hostname: '127.0.0.1',
        port: worker.port,
        agent: worker.agent,
        method: req.method,
        path: url.pathname + url.search,
        headers,
      })
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        req.signal.removeEventListener('abort', abort)
        worker.active--
        if (worker.retired) this.retire(worker)
      }
      const abort = () => upstream.destroy(req.signal.reason)
      req.signal.addEventListener('abort', abort, { once: true })
      if (req.signal.aborted) abort()
      upstream.once('error', (error) => {
        finish()
        reject(error)
      })
      upstream.once('response', (response) => {
        response.once('close', finish)
        response.once('end', finish)
        const responseHeaders = new Headers()
        for (let i = 0; i < response.rawHeaders.length; i += 2) {
          const name = response.rawHeaders[i]
          if (/^(connection|transfer-encoding|keep-alive)$/i.test(name))
            continue
          responseHeaders.append(name, response.rawHeaders[i + 1])
        }
        const status = response.statusCode || 502
        const noBody =
          req.method === 'HEAD' ||
          [204, 205, 304].includes(status) ||
          responseHeaders.has('x-middleware-next') ||
          responseHeaders.has('x-middleware-rewrite') ||
          (status >= 300 && status < 400 && responseHeaders.has('location'))
        if (noBody) response.resume()
        resolve(
          new Response(
            noBody
              ? null
              : (Readable.toWeb(response) as ReadableStream<Uint8Array>),
            {
              status,
              headers: responseHeaders,
            }
          )
        )
      })
      if (req.body) {
        const body = Readable.fromWeb(
          req.body as import('stream/web').ReadableStream<Uint8Array>
        )
        body.once('error', (error) => upstream.destroy(error))
        upstream.once('error', () => body.destroy())
        body.pipe(upstream)
      } else {
        upstream.end()
      }
    })
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
