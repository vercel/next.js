import http from 'node:http'
import path from 'node:path'

import WebSocket from 'ws'
import type { NextAdapter } from 'next'
import { findPort, retry } from 'next-test-utils'
import { isNextDev, nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

describe('WebSocket Route Handlers', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function connect(path = '/ws', protocols?: string | string[]) {
    return new Promise<{
      socket: WebSocket
      response: http.IncomingMessage
      firstMessage: string
    }>((resolve, reject) => {
      const socket = new WebSocket(
        `ws://localhost:${next.appPort}${path}`,
        protocols,
        { headers: { authorization: 'Bearer secret' } }
      )
      let response: http.IncomingMessage
      socket.once('upgrade', (upgradeResponse) => {
        response = upgradeResponse
      })
      socket.once('message', (data) => {
        resolve({ socket, response, firstMessage: data.toString() })
      })
      socket.once('error', reject)
    })
  }

  function nextMessage(socket: WebSocket) {
    return new Promise<{ data: Buffer; isBinary: boolean }>((resolve) => {
      socket.once('message', (data, isBinary) => {
        resolve({ data: Buffer.from(data as Buffer), isBinary })
      })
    })
  }

  it('executes GET once and exposes headers, cookies, and a CrossWS peer', async () => {
    const { socket, response, firstMessage } = await connect(
      '/ws?execution-key=once'
    )
    expect(firstMessage).toBe('connected:1')
    expect(socket.extensions).toBe('')
    expect(response.statusCode).toBe(101)
    expect(response.headers['x-upgrade-result']).toBe('accepted')
    expect(response.headers['x-proxy-result']).toBe('continued')
    expect(response.headers['set-cookie']).toEqual([
      expect.stringContaining('websocket=accepted'),
      expect.stringContaining('websocket-secondary=accepted'),
    ])

    const echoed = new Promise<string>((resolve) => {
      socket.once('message', (data) => resolve(data.toString()))
    })
    socket.send('hello')
    expect(await echoed).toBe('hello')
    socket.close()
  })

  it('sends an ordinary response when the handler rejects the handshake', async () => {
    const result = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const request = http.request({
          host: 'localhost',
          port: next.appPort,
          path: '/ws',
          headers: {
            connection: 'Upgrade',
            upgrade: 'websocket',
            'sec-websocket-key': Buffer.alloc(16).toString('base64'),
            'sec-websocket-version': '13',
          },
        })
        request.once('response', (response) => {
          const chunks: Buffer[] = []
          response.on('data', (chunk) => chunks.push(chunk))
          response.on('end', () => {
            resolve({
              status: response.statusCode!,
              body: Buffer.concat(chunks).toString(),
            })
          })
        })
        request.once('error', reject)
        request.end()
      }
    )

    expect(result).toEqual({ status: 401, body: 'unauthorized' })
  })

  it('rejects NextResponse.upgrade() returned from proxy.ts', async () => {
    const response = await new Promise<http.IncomingMessage>(
      (resolve, reject) => {
        const socket = new WebSocket(
          `ws://localhost:${next.appPort}/ws?proxy-upgrade=1`,
          { headers: { authorization: 'Bearer secret' } }
        )
        socket.once('unexpected-response', (request, result) => {
          request.destroy()
          resolve(result)
        })
        socket.once('error', reject)
      }
    )
    expect(response.statusCode).toBe(500)
  })

  it('supports CrossWS topic subscription and publication', async () => {
    const publisher = await connect('/ws?execution-key=publisher')
    const subscriber = await connect('/ws?execution-key=subscriber')

    const subscribed = nextMessage(subscriber.socket)
    subscriber.socket.send('subscribe:room')
    expect((await subscribed).data.toString()).toBe('subscribed')

    const broadcast = nextMessage(subscriber.socket)
    const published = nextMessage(publisher.socket)
    publisher.socket.send('publish:room:hello')
    expect((await published).data.toString()).toBe('published')
    expect((await broadcast).data.toString()).toBe('hello')

    publisher.socket.close()
    subscriber.socket.close()
  })

  it('isolates CrossWS pub/sub by pathname namespace', async () => {
    const roomA1 = await connect('/rooms/a')
    const roomA2 = await connect('/rooms/a')
    const roomB = await connect('/rooms/b')

    const broadcast = nextMessage(roomA2.socket)
    const published = nextMessage(roomA1.socket)
    roomA1.socket.send('publish')
    expect((await published).data.toString()).toBe('published')
    expect((await broadcast).data.toString()).toBe('broadcast:/rooms/a')

    const roomBEcho = nextMessage(roomB.socket)
    roomB.socket.send('probe')
    expect((await roomBEcho).data.toString()).toBe('probe')

    roomA1.socket.close()
    roomA2.socket.close()
    roomB.socket.close()
  })

  it('supports rewrites before selecting the App Route', async () => {
    const { socket } = await connect('/socket')
    socket.close()
  })

  it.each(['throw', 'reject'])(
    'closes hook %s errors with 1011',
    async (kind) => {
      const closeCode = await new Promise<number>((resolve, reject) => {
        const socket = new WebSocket(
          `ws://localhost:${next.appPort}/ws?hook-error=${kind}`,
          { headers: { authorization: 'Bearer secret' } }
        )
        socket.once('close', resolve)
        socket.once('error', reject)
      })
      expect(closeCode).toBe(1011)
    }
  )

  it('supports CrossWS messages, object sending, and binary data', async () => {
    const { socket } = await connect()

    const binary = nextMessage(socket)
    socket.send(Buffer.from([1, 2, 3]))
    expect(await binary).toEqual({
      data: Buffer.from([1, 2, 3]),
      isBinary: true,
    })

    const object = nextMessage(socket)
    socket.send('object')
    expect(JSON.parse((await object).data.toString())).toEqual({
      user: 'server',
      message: 'object response',
    })

    const views = nextMessage(socket)
    socket.send('views')
    expect(JSON.parse((await views).data.toString())).toEqual({
      text: 'views',
      bytes: Array.from(Buffer.from('views')),
      arrayBufferLength: expect.any(Number),
    })

    socket.terminate()
  })

  it('enforces the fixed 16 MiB payload limit', async () => {
    const { socket } = await connect('/ws?execution-key=max-payload')
    const closed = new Promise<number>((resolve) =>
      socket.once('close', resolve)
    )
    socket.send(Buffer.alloc(16 * 1024 * 1024 + 1))
    expect(await closed).toBe(1009)
  })

  it('returns 426 for a normal HTTP request that chooses to upgrade', async () => {
    const response = await next.fetch('/ws', {
      headers: { authorization: 'Bearer secret' },
    })
    expect(response.status).toBe(426)
    expect(await response.text()).toContain('only accepts WebSocket')
  })

  it('exposes an Adapter-facing upgradeHandler on the APP_ROUTE output', async () => {
    if (isNextDev) return

    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')
    const output = outputs.appRoutes.find((route) => route.pathname === '/ws')
    expect(output?.runtime).toBe('nodejs')

    const routeModule = require(output!.filePath)
    expect(routeModule.upgradeHandler).toBeFunction()

    const port = await findPort()
    const server = http.createServer()
    server.on('upgrade', (request, socket, head) => {
      void routeModule.upgradeHandler(
        {
          requestMeta: {
            relativeProjectDir: path.relative(process.cwd(), next.testDir),
            distDir: path.join(next.testDir, '.next'),
          },
        },
        { node: { req: request, socket, head } }
      )
    })
    await new Promise<void>((resolve) => server.listen(port, resolve))

    try {
      const firstMessage = await new Promise<string>((resolve, reject) => {
        const socket = new WebSocket(`ws://localhost:${port}/ws`, {
          headers: { authorization: 'Bearer secret' },
        })
        socket.once('message', (data) => {
          resolve(data.toString())
          socket.close()
        })
        socket.once('error', reject)
      })
      expect(firstMessage).toMatch(/^connected:/)
    } finally {
      server.close()
    }
  })

  it('returns 501 from upgradeHandler when raw primitives are incomplete', async () => {
    if (isNextDev) return

    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')
    const output = outputs.appRoutes.find((route) => route.pathname === '/ws')
    const routeModule = require(output!.filePath)

    const port = await findPort()
    const server = http.createServer()
    server.on('upgrade', (request, socket) => {
      void routeModule.upgradeHandler(
        {
          requestMeta: {
            relativeProjectDir: path.relative(process.cwd(), next.testDir),
            distDir: path.join(next.testDir, '.next'),
          },
        },
        { node: { req: request, socket, head: undefined } as any }
      )
    })
    await new Promise<void>((resolve) => server.listen(port, resolve))

    try {
      const response = await new Promise<http.IncomingMessage>(
        (resolve, reject) => {
          const socket = new WebSocket(`ws://localhost:${port}/ws`, {
            headers: { authorization: 'Bearer secret' },
          })
          socket.once('unexpected-response', (request, result) => {
            request.destroy()
            resolve(result)
          })
          socket.once('error', reject)
        }
      )
      expect(response.statusCode).toBe(501)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('closes sockets with 1012 when the route changes in development', async () => {
    if (!isNextDev) return

    const { socket } = await connect()
    const closed = new Promise<number>((resolve) =>
      socket.once('close', resolve)
    )
    await next.patchFile('app/ws/route.ts', (content) =>
      content.replace(
        "export const dynamic = 'force-dynamic'",
        "export const dynamic = 'force-dynamic' // updated"
      )
    )
    expect(await closed).toBe(1012)
  })

  it('closes sockets with 1001 during server shutdown', async () => {
    const { socket } = await connect()
    const closed = new Promise<number>((resolve) =>
      socket.once('close', resolve)
    )
    await next.stop('SIGTERM')
    expect(await closed).toBe(1001)
  })
})

describe('Adapter disabling WebSocket Route Handlers', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/unsupported-adapter'),
    skipDeployment: true,
    skipStart: true,
  })

  it('uses the experimental flag override in development and production', async () => {
    await next.start()
    const response = await next.fetch('/ws')
    expect(response.status).toBe(500)

    await retry(() => {
      expect(stripAnsi(next.cliOutput)).toContain(
        'NextResponse.upgrade() requires experimental.webSocketRouteHandlers to be enabled in next.config.js.'
      )
    })
  })
})
