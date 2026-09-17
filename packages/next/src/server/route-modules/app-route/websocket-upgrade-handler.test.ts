import type { IncomingMessage } from 'node:http'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import type { AppRouteRouteModule } from './module.compiled'
import { createAppRouteWebSocketEntrypoint } from './websocket-runtime.external'
import { getRawHttpResponseStatus } from '../../websocket-http'

const transportMessage =
  'WebSocket Route Handlers require the Node.js upgrade transport namespace with raw upgrade primitives and persistent sockets.'

function createRouteModule(): AppRouteRouteModule {
  // The defensive transport guards run before the route module is consulted,
  // so the surrounding hooks only need to exist as stubs.
  return {
    isDev: false,
    prepareNodeRequest: jest.fn(),
    createNodeRequestContext: jest.fn(),
    handle: jest.fn(),
    onRequestError: jest.fn(),
  } as unknown as AppRouteRouteModule
}

function createEntrypoint() {
  return createAppRouteWebSocketEntrypoint({
    routeModule: createRouteModule(),
    srcPage: '/ws/route',
    multiZoneDraftMode: false,
    createNextRequest: jest.fn(),
  })
}

function createIncomingRequest(): IncomingMessage {
  const headers = {
    host: 'example.test',
    connection: 'Upgrade',
    upgrade: 'websocket',
    'sec-websocket-key': Buffer.alloc(16).toString('base64'),
    'sec-websocket-version': '13',
  }
  const req = new EventEmitter() as IncomingMessage
  req.method = 'GET'
  req.url = '/ws'
  req.httpVersion = '1.1'
  req.headers = headers
  req.rawHeaders = Object.entries(headers).flatMap(([name, value]) => [
    name,
    value,
  ])
  return req
}

describe('createAppRouteWebSocketEntrypoint defensive transport guards', () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('reports and refuses a transport without a socket', async () => {
    const outcome = await createEntrypoint().upgradeHandler(
      {},
      {
        node: {
          req: createIncomingRequest(),
          socket: undefined as never,
          head: Buffer.alloc(0),
        },
      }
    )

    expect(outcome).toEqual({ upgraded: false })
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(transportMessage)
  })

  it.each([
    [
      'destroyed',
      () => {
        const socket = new PassThrough()
        socket.destroy()
        return socket
      },
    ],
    [
      'writable-ended',
      () => {
        const socket = new PassThrough()
        socket.resume()
        socket.end()
        return socket
      },
    ],
  ])(
    'reports and refuses a %s socket without writing any bytes',
    async (_kind, createSocket) => {
      const socket = createSocket()
      const writeSpy = jest.spyOn(socket, 'write')

      const outcome = await createEntrypoint().upgradeHandler(
        {},
        {
          node: {
            req: createIncomingRequest(),
            socket,
            head: Buffer.alloc(0),
          },
        }
      )

      expect(outcome).toEqual({ upgraded: false })
      expect(writeSpy).not.toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(transportMessage)
    }
  )

  it('reports and destroys the socket when the transport omits the request', async () => {
    const socket = new PassThrough()
    socket.resume()
    const writeSpy = jest.spyOn(socket, 'write')

    const outcome = await createEntrypoint().upgradeHandler(
      {},
      {
        node: {
          req: undefined as never,
          socket,
          head: Buffer.alloc(0),
        },
      }
    )

    expect(outcome).toEqual({ upgraded: false })
    expect(writeSpy).not.toHaveBeenCalled()
    expect(socket.destroyed).toBe(true)
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(transportMessage)
  })

  it('answers a non-Buffer head with a Next-owned 501 response', async () => {
    const socket = new PassThrough()
    const chunks: Buffer[] = []
    socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)))

    const outcome = await createEntrypoint().upgradeHandler(
      {},
      {
        node: {
          req: createIncomingRequest(),
          socket,
          head: 'not-a-buffer' as never,
        },
      }
    )

    expect(outcome).toEqual({ statusCode: 501, upgraded: false })
    expect(getRawHttpResponseStatus(socket)).toBe(501)
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(transportMessage)

    const rawResponse = Buffer.concat(chunks).toString()
    expect(rawResponse).toContain('501')
    expect(rawResponse).toContain('Not Implemented')
    expect(socket.destroyed).toBe(true)
  })
})
