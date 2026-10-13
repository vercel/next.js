import { spawn, type ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import { Agent, request, type IncomingMessage, type ServerResponse } from 'http'
import { join, relative, isAbsolute } from 'path'
import type { Readable } from 'stream'
import type { ParsedUrlQuery } from 'querystring'

interface Worker {
  child: ChildProcess
  token: string
  port: number
  agent: Agent
  active: number
  retired: boolean
  killTimer: ReturnType<typeof setTimeout> | undefined
}

/** Owns activation and transport, never compilation or filesystem watching. */
export class NativeRouteManager {
  private workers = new Map<string, Promise<Worker>>()
  private routes = new Map<string, string>()
  private closed = false
  private allWorkers = new Set<Worker>()

  constructor(private readonly distDir: string) {}

  private async start(executable: string): Promise<Worker> {
    const token = randomBytes(32).toString('hex')
    const child = spawn(executable, [], {
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

  async invoke(
    page: string,
    entry: string,
    req: IncomingMessage,
    res: ServerResponse,
    params: ParsedUrlQuery
  ): Promise<void> {
    if (this.closed) throw new Error('Next.js server is closing')
    // Read current emitted output in development; this is not a compiler cache.
    const descriptor = JSON.parse(
      await fs.readFile(join(this.distDir, 'server', entry), 'utf8')
    )
    if (descriptor.version !== 1 || typeof descriptor.executable !== 'string') {
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
    const serverDir = join(this.distDir, 'server')
    const executable = join(serverDir, descriptor.executable)
    const localPath = relative(serverDir, executable)
    if (localPath.startsWith('..') || isAbsolute(localPath)) {
      throw new Error('Native route executable is outside the server output')
    }
    if (this.closed) throw new Error('Next.js server is closing')
    const previous = this.routes.get(page)
    this.routes.set(page, executable)
    let pending = this.workers.get(executable)
    if (!pending) {
      pending = this.start(executable)
      this.workers.set(executable, pending)
      // Startup failures stay cached until the executable changes or the server restarts.
      pending.catch(() => {})
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
    worker.active++
    const values: Record<string, string[]> = Object.create(null)
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined)
        values[name] = Array.isArray(value) ? value : [value]
    }
    // Public values cannot supply private metadata. Authentication is process scoped.
    // Use normalized headers so proxy.ts request-header mutations are respected.
    const headers = { ...req.headers }
    const repeated: Record<string, string[]> = Object.create(null)
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i].toLowerCase()
      ;(repeated[name] ||= []).push(req.rawHeaders[i + 1])
    }
    for (const [name, value] of Object.entries(repeated)) {
      if (
        value.length > 1 &&
        headers[name] === value.join(name === 'cookie' ? '; ' : ', ')
      ) {
        headers[name] = value
      }
    }
    const hopHeaders = [
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
      ...String(headers.connection || '')
        .toLowerCase()
        .split(',')
        .map((name) => name.trim()),
    ]
    for (const name of hopHeaders) delete headers[name]
    for (const name of Object.keys(headers)) {
      if (name.startsWith('x-next-go-')) delete headers[name]
    }
    headers['x-next-go-token'] = worker.token
    headers['x-next-go-params'] = Buffer.from(JSON.stringify(values)).toString(
      'base64url'
    )
    delete headers.connection
    delete headers['transfer-encoding']
    try {
      await new Promise<void>((resolve, reject) => {
        const upstream = request({
          hostname: '127.0.0.1',
          port: worker.port,
          agent: worker.agent,
          method: req.method,
          path: req.url,
          headers,
        })
        const cancel = () => {
          upstream.destroy()
          done()
        }
        let finished = false
        const done = (error?: Error) => {
          if (finished) return
          finished = true
          req.off('aborted', cancel)
          res.off('close', cancel)
          if (error) reject(error)
          else resolve()
        }
        req.once('aborted', cancel)
        res.once('close', cancel)
        upstream.once('error', done)
        upstream.once('response', (response) => {
          res.statusCode = response.statusCode || 502
          // rawHeaders preserves repeated Set-Cookie and other response fields.
          const responseHeaders: Record<string, string[]> = Object.create(null)
          for (let i = 0; i < response.rawHeaders.length; i += 2) {
            const name = response.rawHeaders[i].toLowerCase()
            if (name === 'connection' || name === 'transfer-encoding') continue
            ;(responseHeaders[name] ||= []).push(response.rawHeaders[i + 1])
          }
          for (const [name, value] of Object.entries(responseHeaders)) {
            // Headers supplied by Next's routing/proxy phases remain on res.
            const existing =
              name === 'set-cookie' ? res.getHeader(name) : undefined
            const merged = existing
              ? [
                  ...(Array.isArray(existing)
                    ? existing.map(String)
                    : [String(existing)]),
                  ...value,
                ]
              : value
            res.setHeader(name, merged.length === 1 ? merged[0] : merged)
          }
          response.once('error', (error) => {
            res.destroy(error)
            done(error)
          })
          res.once('finish', () => done())
          response.pipe(res)
        })
        req.pipe(upstream)
      })
    } finally {
      worker.active--
      if (worker.retired) this.retire(worker)
    }
  }

  reconcile(pages: Set<string>) {
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
  }
}
