import childProcess from 'child_process'
import { EventEmitter } from 'events'
import { promises as fs } from 'fs'
import http from 'http'
import { Socket } from 'net'
import { PassThrough } from 'stream'
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

  it('returns native middleware responses with public URLs, bodies and repeated cookies', async () => {
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
      res.setHeader('set-cookie', ['first=one; Path=/', 'second=two; Path=/'])
      res.writeHead(201)
      res.write('first')
      setImmediate(() => res.end('second'))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
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
      const response = await manager.invokeMiddleware(
        'middleware.native.json',
        new Request('https://public.example/path?query=one', {
          method: 'POST',
          body: 'request body',
        })
      )
      expect(response.status).toBe(201)
      expect(response.headers.getSetCookie()).toEqual([
        'first=one; Path=/',
        'second=two; Path=/',
      ])
      expect(await response.text()).toBe('firstsecond')
      expect(received).toEqual({
        url: '/path?query=one',
        host: 'public.example',
        protocol: 'https',
        body: 'request body',
      })
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
  })
})
