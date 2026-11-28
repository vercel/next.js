import childProcess from 'child_process'
import { EventEmitter } from 'events'
import { promises as fs } from 'fs'
import http from 'http'
import { Socket } from 'net'
import { PassThrough } from 'stream'
import { brotliCompressSync, deflateSync, gzipSync } from 'zlib'
import {
  NativeRouteManager,
  observeNativeRouteWorkers,
  type NativeRouteWorkerEvent,
} from 'next/dist/server/lib/native-route.external'
import { filterInternalHeaders } from 'next/dist/server/lib/server-ipc/utils'

describe('native route runtime', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each(['request', 'response'] as const)(
    'does not dispatch when the %s disconnects before worker readiness',
    async (disconnected) => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stdin: new PassThrough(),
        exitCode: null as number | null,
        kill: jest.fn(),
      })
      let resolveStarted!: () => void
      const started = new Promise<void>((resolve) => {
        resolveStarted = resolve
      })
      let token!: string
      jest.spyOn(childProcess, 'spawn').mockImplementation((_, __, options) => {
        token = options!.env!.__NEXT_GO_TOKEN!
        resolveStarted()
        return child as unknown as childProcess.ChildProcess
      })
      jest.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify({
          version: 1,
          executable: 'worker',
          route: '/',
          goos: process.platform === 'win32' ? 'windows' : process.platform,
          goarch:
            process.arch === 'x64'
              ? 'amd64'
              : process.arch === 'ia32'
                ? '386'
                : process.arch,
        })
      )
      const dispatch = jest.spyOn(http, 'request').mockImplementation(() => {
        throw new Error('Disconnected request was dispatched')
      })
      const manager = new NativeRouteManager(__dirname, false)
      const req = new http.IncomingMessage(new Socket())
      const res = new http.ServerResponse(req)
      const invocation = manager.invoke(
        '/route',
        'route.native.json',
        req,
        res,
        '/route'
      )

      try {
        await started
        if (disconnected === 'request') {
          req.destroy()
          expect(req.aborted).toBe(true)
        } else {
          res.destroy()
          expect(res.destroyed).toBe(true)
        }
        child.stdout.write(`\x1eNEXT_GO_READY:${token}:12345\n`)

        await expect(invocation).resolves.toBeUndefined()
        expect(dispatch).not.toHaveBeenCalled()
        expect(req.listenerCount('aborted')).toBe(0)
        expect(res.listenerCount('close')).toBe(0)
      } finally {
        child.exitCode = 0
        child.emit('exit', 0)
        child.stdout.destroy()
        child.stdin.destroy()
        req.destroy()
        res.destroy()
        await manager.close()
      }
    }
  )

  it('retries starting an executable that is still open for writing (ETXTBSY)', async () => {
    // A process forked while Turbopack wrote the executable can keep it open
    // for writing briefly, and spawning it fails with ETXTBSY until then.
    const children: Array<
      EventEmitter & {
        stdout: PassThrough
        stdin: PassThrough
        exitCode: number | null
        kill: jest.Mock
      }
    > = []
    let resolveStarted!: () => void
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    let token!: string
    const spawn = jest
      .spyOn(childProcess, 'spawn')
      .mockImplementation((_, __, options) => {
        token = options!.env!.__NEXT_GO_TOKEN!
        const child = Object.assign(new EventEmitter(), {
          stdout: new PassThrough(),
          stdin: new PassThrough(),
          exitCode: null as number | null,
          kill: jest.fn(),
        })
        children.push(child)
        if (children.length <= 2) {
          process.nextTick(() =>
            child.emit(
              'error',
              Object.assign(new Error('spawn ETXTBSY'), { code: 'ETXTBSY' })
            )
          )
        } else {
          resolveStarted()
        }
        return child as unknown as childProcess.ChildProcess
      })
    jest.spyOn(fs, 'readFile').mockResolvedValue(
      JSON.stringify({
        version: 1,
        executable: 'worker',
        route: '/route',
        goos: process.platform === 'win32' ? 'windows' : process.platform,
        goarch:
          process.arch === 'x64'
            ? 'amd64'
            : process.arch === 'ia32'
              ? '386'
              : process.arch,
      })
    )
    const dispatch = jest.spyOn(http, 'request').mockImplementation(() => {
      throw new Error('Disconnected request was dispatched')
    })
    const manager = new NativeRouteManager(__dirname, false)
    const req = new http.IncomingMessage(new Socket())
    const res = new http.ServerResponse(req)
    const invocation = manager.invoke(
      '/route',
      'route.native.json',
      req,
      res,
      '/route'
    )

    try {
      await started
      // The third attempt starts. Disconnect before readiness so the request
      // is not dispatched to the fake worker.
      expect(spawn).toHaveBeenCalledTimes(3)
      res.destroy()
      children[2].stdout.write(`\x1eNEXT_GO_READY:${token}:12345\n`)
      await expect(invocation).resolves.toBeUndefined()
      expect(dispatch).not.toHaveBeenCalled()
    } finally {
      for (const child of children) {
        child.exitCode = 0
        child.emit('exit', 0)
        child.stdout.destroy()
        child.stdin.destroy()
      }
      req.destroy()
      res.destroy()
      await manager.close()
    }
  })

  it('serves every route of a shared executable from one worker and names the route', async () => {
    let token = ''
    const received: Array<{ route: string[]; url?: string }> = []
    const worker = http.createServer((req, res) => {
      expect(req.headers['x-next-internal-go-token']).toBe(token)
      // Every x-matched-path field line in any letter case, as the UTF-8
      // text of its bytes.
      const route: string[] = []
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        if (req.rawHeaders[i].toLowerCase() === 'x-matched-path') {
          route.push(
            Buffer.from(req.rawHeaders[i + 1], 'latin1').toString('utf8')
          )
        }
        expect(req.rawHeaders[i].toLowerCase()).not.toBe(
          'x-next-internal-go-route'
        )
      }
      received.push({ route, url: req.url })
      res.end('ok')
    })
    await new Promise<void>((resolve) => worker.listen(0, '127.0.0.1', resolve))
    const port = (worker.address() as import('net').AddressInfo).port
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stdin: new PassThrough(),
      exitCode: null as number | null,
      kill: jest.fn(),
    })
    const spawn = jest
      .spyOn(childProcess, 'spawn')
      .mockImplementation((_, __, options) => {
        token = options!.env!.__NEXT_GO_TOKEN!
        setImmediate(() =>
          child.stdout.write(`\x1eNEXT_GO_READY:${token}:${port}\n`)
        )
        return child as unknown as childProcess.ChildProcess
      })
    // A production build's descriptors all name the same executable, and each
    // carries the route ID the compiler assigned to its route.
    const routes: Record<string, [page: string, route: string]> = {
      '/users/1': ['/(group)/users/[id]/route', '/users/[id]'],
      '/health': ['/health/route', '/health'],
      '/catch/one/two': ['/catch/[...slug]/route', '/catch/[...slug]'],
      '/': ['/route', '/'],
      // Route IDs that are not valid header values as is.
      '/%E6%97%A5%E6%9C%AC%E8%AA%9E': ['/日本語/route', '/日本語'],
      // A literal folder named %5Bid%5D beside a dynamic [id] folder. Its ID is
      // the dynamic route's ID percent-encoded, so each must keep one spelling.
      '/users/%255Bid%255D': ['/users/%5Bid%5D/route', '/users/%5Bid%5D'],
    }
    const events: NativeRouteWorkerEvent[] = []
    observeNativeRouteWorkers((event) => events.push(event))
    jest.spyOn(fs, 'readFile').mockImplementation((async (file: string) => {
      // The manager joins the descriptor path with the platform separator.
      const descriptorPath = String(file).replace(/\\/g, '/')
      const [, route] = Object.values(routes).find(([page]) =>
        descriptorPath.endsWith(`app${page}.native.json`)
      )!
      return JSON.stringify({
        executable: 'go-routes-0123',
        route,
        goos: process.platform === 'win32' ? 'windows' : process.platform,
        goarch:
          process.arch === 'x64'
            ? 'amd64'
            : process.arch === 'ia32'
              ? '386'
              : process.arch,
      })
    }) as typeof fs.readFile)
    const manager = new NativeRouteManager(__dirname, false)
    const front = http.createServer((req, res) => {
      const [page] = routes[req.url!]
      manager
        .invoke(page, `app${page}.native.json`, req, res, req.url!)
        .catch((error) => {
          res.statusCode = 500
          res.end(String(error))
        })
    })
    await new Promise<void>((resolve) => front.listen(0, '127.0.0.1', resolve))
    const frontPort = (front.address() as import('net').AddressInfo).port
    try {
      for (const pathname of [
        '/users/1',
        '/health',
        '/users/1',
        '/catch/one/two',
        '/',
        '/%E6%97%A5%E6%9C%AC%E8%AA%9E',
        '/users/%255Bid%255D',
      ]) {
        const response = await fetch(
          `http://127.0.0.1:${frontPort}${pathname}`,
          {
            // A client cannot choose the route.
            headers: {
              'x-matched-path': '/health, /health',
              'x-next-internal-go-route': '/health',
            },
          }
        )
        expect(response.status).toBe(200)
        await response.text()
      }
      // Repeated field lines in other letter cases are replaced too.
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port: frontPort,
            path: '/users/1',
            // A raw header list keeps repeated fields and their letter case,
            // and replaces Node's defaults, including Host. Node accepts it,
            // though its types only list a header object.
            headers: [
              'Host',
              `127.0.0.1:${frontPort}`,
              'X-Matched-Path',
              '/health',
              'x-matched-path',
              '/health',
              'X-MATCHED-PATH',
              '/health',
            ] as unknown as http.OutgoingHttpHeaders,
          },
          (res) => {
            let body = ''
            res.on('data', (chunk) => (body += chunk))
            res.on('end', () => {
              try {
                expect([res.statusCode, body]).toEqual([200, 'ok'])
                resolve()
              } catch (error) {
                reject(error)
              }
            })
          }
        )
        req.on('error', reject)
        req.end()
      })
      expect(spawn).toHaveBeenCalledTimes(1)
      // Next.js names the routed handler's exact route ID in x-matched-path,
      // once, as its UTF-8 bytes, as Vercel's routing does.
      expect(received).toEqual([
        { route: ['/users/[id]'], url: '/users/1' },
        { route: ['/health'], url: '/health' },
        { route: ['/users/[id]'], url: '/users/1' },
        { route: ['/catch/[...slug]'], url: '/catch/one/two' },
        { route: ['/'], url: '/' },
        { route: ['/日本語'], url: '/%E6%97%A5%E6%9C%AC%E8%AA%9E' },
        { route: ['/users/%5Bid%5D'], url: '/users/%255Bid%255D' },
        { route: ['/users/[id]'], url: '/users/1' },
      ])
      // Each routed page is announced once, even when pages share a worker.
      expect(
        events.flatMap((event) =>
          event.event === 'worker' ? [event.page] : []
        )
      ).toEqual([
        '/(group)/users/[id]/route',
        '/health/route',
        '/catch/[...slug]/route',
        '/route',
        '/日本語/route',
        '/users/%5Bid%5D/route',
      ])
    } finally {
      observeNativeRouteWorkers(() => {})
      child.exitCode = 0
      child.emit('exit', 0)
      child.stdout.destroy()
      child.stdin.destroy()
      await manager.close()
      for (const server of [front, worker]) {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        )
      }
    }
  })

  it('strips private Go transport metadata at the public request boundary', () => {
    const headers = {
      'x-next-internal-go-token': 'untrusted-token',
      host: 'example.test',
      cookie: 'session=value',
    }

    filterInternalHeaders(headers)

    expect(headers).toEqual({
      host: 'example.test',
      cookie: 'session=value',
    })
  })

  it.each([
    { status: 600, compressed: false, setupError: undefined },
    { status: 999, compressed: false, setupError: undefined },
    { status: 600, compressed: true, setupError: undefined },
    { status: 600, compressed: false, setupError: 'headers' },
    { status: 600, compressed: false, setupError: 'body' },
  ])(
    'cleans up native middleware errors (status: $status, gzip: $compressed, setup: $setupError)',
    async ({ status, compressed, setupError }) => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stdin: new PassThrough(),
        exitCode: null as number | null,
        kill: jest.fn(),
      })
      const stdinEnd = jest.spyOn(child.stdin, 'end')
      const manager = new NativeRouteManager(__dirname, false)
      const server = http.createServer((req, res) => {
        if (req.url === '/retire') manager.reconcile(new Set())
        const payload = compressed
          ? gzipSync(Buffer.from('response'))
          : Buffer.from('response')
        if (compressed) res.setHeader('content-encoding', 'gzip')
        res.writeHead(req.url === '/healthy' ? 200 : status, {
          'content-length': payload.length,
        })
        res.end(payload)
      })
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve)
      )
      const port = (server.address() as import('net').AddressInfo).port
      const spawn = jest
        .spyOn(childProcess, 'spawn')
        .mockImplementation((_, __, options) => {
          const token = options!.env!.__NEXT_GO_TOKEN!
          setImmediate(() =>
            child.stdout.write(`\x1eNEXT_GO_READY:${token}:${port}\n`)
          )
          return child as unknown as childProcess.ChildProcess
        })
      jest.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify({
          executable: 'worker',
          goos: process.platform === 'win32' ? 'windows' : process.platform,
          goarch:
            process.arch === 'x64'
              ? 'amd64'
              : process.arch === 'ia32'
                ? '386'
                : process.arch,
        })
      )
      const invoke = (pathname: string) => {
        const invalid = pathname === '/invalid'
        const req = new Request(`https://public.example${pathname}`, {
          headers:
            invalid && setupError === 'headers'
              ? { 'x-invalid': '\x01' }
              : undefined,
          ...(invalid && setupError === 'body'
            ? { method: 'POST', body: 'request body' }
            : {}),
        })
        if (invalid && setupError === 'body') req.body!.getReader()
        return manager.invokeMiddleware('middleware.native.json', req)
      }
      try {
        if (setupError) {
          await expect(invoke('/invalid')).rejects.toMatchObject({
            code:
              setupError === 'headers'
                ? 'ERR_INVALID_CHAR'
                : 'ERR_INVALID_STATE',
          })
        } else {
          await expect(invoke('/invalid')).rejects.toThrow(
            'init["status"] must be in the range of 200 to 599'
          )
        }
        const following = await invoke('/healthy')
        expect(following.status).toBe(200)
        expect(await following.text()).toBe('response')
        expect(spawn).toHaveBeenCalledTimes(1)
        expect(stdinEnd).not.toHaveBeenCalled()

        await expect(invoke('/retire')).rejects.toThrow(
          'init["status"] must be in the range of 200 to 599'
        )
        // Allow the destroyed response's close event to run as well as catch.
        await new Promise<void>((resolve) => setImmediate(resolve))
        expect(stdinEnd).toHaveBeenCalledTimes(1)
      } finally {
        child.exitCode = 0
        child.emit('exit', 0)
        child.stdout.destroy()
        child.stdin.destroy()
        await manager.close()
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        )
      }
    }
  )

  it.each([
    ['POST', 'identity'],
    ['PUT', 'identity'],
    ['PATCH', 'identity'],
    ['DELETE', 'identity'],
    ['OPTIONS', 'identity'],
    ['HEAD', 'identity'],
    ['GET', 'gzip'],
    ['GET', 'deflate'],
    ['GET', 'br'],
    ['GET', 'gzip, br'],
  ])(
    'returns native middleware responses for %s with %s compression and repeated cookies',
    async (method, encoding) => {
      const hasBody = method !== 'HEAD' && method !== 'GET'
      let token = ''
      let received: {
        url?: string
        host?: string
        protocol?: string
        body?: string
      } = {}
      const server = http.createServer(async (req, res) => {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk)
        received = {
          url: req.url,
          host: req.headers.host,
          protocol: req.headers['x-forwarded-proto'] as string,
          body: Buffer.concat(chunks).toString(),
        }
        expect(req.headers['x-next-internal-go-token']).toBe(token)
        expect(req.headers['x-next-internal-test']).toBeUndefined()
        expect(req.headers['cache-control']).toBeUndefined()
        expect(req.headers.pragma).toBeUndefined()
        expect(req.headers.accept).toBeUndefined()
        expect(req.headers['user-agent']).toBeUndefined()
        expect(req.headers['sec-fetch-mode']).toBe(
          req.url === '/path?query=one' ? 'navigate' : undefined
        )
        res.setHeader('set-cookie', ['first=one; Path=/', 'second=two; Path=/'])
        let payload: Buffer = Buffer.from('firstsecond')
        if (encoding !== 'identity') {
          for (const coding of encoding.split(', ')) {
            if (coding === 'gzip') payload = gzipSync(payload)
            else if (coding === 'deflate') payload = deflateSync(payload)
            else if (coding === 'br') payload = brotliCompressSync(payload)
          }
          res.setHeader('content-encoding', encoding)
          res.setHeader('content-length', payload.length)
        }
        res.writeHead(201)
        res.write(payload.subarray(0, 5))
        if (req.url === '/abort') return
        setImmediate(() => res.end(payload.subarray(5)))
      })
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve)
      )
      const port = (server.address() as import('net').AddressInfo).port
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stdin: new PassThrough(),
        exitCode: null as number | null,
        kill: jest.fn(),
      })
      jest.spyOn(childProcess, 'spawn').mockImplementation((_, __, options) => {
        token = options!.env!.__NEXT_GO_TOKEN!
        setImmediate(() =>
          child.stdout.write(`\x1eNEXT_GO_READY:${token}:${port}\n`)
        )
        return child as unknown as childProcess.ChildProcess
      })
      jest.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify({
          executable: 'worker',
          goos: process.platform === 'win32' ? 'windows' : process.platform,
          goarch: process.arch === 'x64' ? 'amd64' : process.arch,
        })
      )
      const manager = new NativeRouteManager(__dirname, false)
      try {
        jest
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async () => new Response('application cache'))
        const response = await manager.invokeMiddleware(
          'middleware.native.json',
          new Request('https://public.example/path?query=one', {
            method,
            body: hasBody ? 'request body' : undefined,
            headers: {
              'x-next-internal-test': 'internal value',
              'sec-fetch-mode': 'navigate',
            },
          })
        )
        expect(response.status).toBe(201)
        expect(response.headers.getSetCookie()).toEqual([
          'first=one; Path=/',
          'second=two; Path=/',
        ])
        expect(await response.text()).toBe(
          method === 'HEAD' ? '' : 'firstsecond'
        )
        expect(received).toEqual({
          url: '/path?query=one',
          host: 'public.example',
          protocol: 'https',
          body: hasBody ? 'request body' : '',
        })
        const following = await manager.invokeMiddleware(
          'middleware.native.json',
          new Request('https://public.example/path')
        )
        expect(following.status).toBe(201)
        expect(await following.text()).toBe('firstsecond')
        expect(received.body).toBe('')

        const controller = new AbortController()
        const streaming = await manager.invokeMiddleware(
          'middleware.native.json',
          new Request('https://public.example/abort', {
            signal: controller.signal,
          })
        )
        controller.abort()
        await expect(streaming.text()).rejects.toThrow()
      } finally {
        child.exitCode = 0
        child.emit('exit', 0)
        child.stdout.destroy()
        child.stdin.destroy()
        await manager.close()
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        )
      }
    }
  )
})
