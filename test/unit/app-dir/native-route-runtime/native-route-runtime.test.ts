import childProcess from 'child_process'
import { EventEmitter } from 'events'
import { promises as fs } from 'fs'
import http from 'http'
import { Socket } from 'net'
import { PassThrough } from 'stream'
import { brotliCompressSync, deflateSync, gzipSync } from 'zlib'
import { NativeRouteManager } from 'next/dist/server/lib/native-route.external'
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
    { status: 600, compressed: false },
    { status: 999, compressed: false },
    { status: 600, compressed: true },
  ])(
    'rejects native middleware status $status (gzip: $compressed) without losing worker cleanup',
    async ({ status, compressed }) => {
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
      const invoke = (pathname: string) =>
        manager.invokeMiddleware(
          'middleware.native.json',
          new Request(`https://public.example${pathname}`)
        )
      try {
        await expect(invoke('/invalid')).rejects.toThrow(
          'init["status"] must be in the range of 200 to 599'
        )
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
