import { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'
import { PassThrough } from 'node:stream'
import type { Duplex } from 'node:stream'

import type { NextRequest } from './web/spec-extension/request'
import { setWebSocketUpgradeMetadata } from './web/spec-extension/websocket-upgrade-response'
import type {
  WebSocketTransportConnection,
  WebSocketTransportHooks,
  WebSocketTransportMessage,
  WebSocketTransportPeer,
  WebSocketUpgradeTransportContext,
  WebSocketUpgradeTransportOptions,
} from './websocket-upgrade'

interface MockWebSocketServerOptions {
  noServer: boolean
  clientTracking: boolean
  allowSynchronousEvents: boolean
  autoPong: boolean
  handleProtocols(
    protocols: Set<string>,
    request: IncomingMessage
  ): string | false
  maxPayload: number
  perMessageDeflate: boolean
  maxFragments: number
  maxBufferedChunks: number
  closeTimeout: number
}

type MockUpgradeCallback = (websocket: MockWebSocket) => void
type MockHandleUpgrade = (
  server: MockWebSocketServer,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  callback: MockUpgradeCallback
) => void

let mockHandleUpgrade: MockHandleUpgrade | undefined
let mockWebSocketServers: MockWebSocketServer[] = []
let mockWebSockets: MockWebSocket[] = []
let mockUpgradeHeaders: string[][] = []

class MockWebSocket extends EventEmitter {
  readyState = 1
  bufferedAmount = 0
  pause = jest.fn()
  resume = jest.fn()
  send = jest.fn()
  close = jest.fn((_code?: number, _reason?: string) => {
    this.readyState = 2
  })
  terminate = jest.fn(() => {
    this.readyState = 3
  })
  pong = jest.fn()
}

function completeMockUpgrade(
  server: MockWebSocketServer,
  request: IncomingMessage,
  callback: MockUpgradeCallback
): MockWebSocket {
  const websocket = new MockWebSocket()
  const headers = ['Upgrade: websocket', 'Connection: Upgrade']
  mockWebSockets.push(websocket)
  mockUpgradeHeaders.push(headers)
  server.emit('headers', headers, request)
  callback(websocket)
  return websocket
}

class MockWebSocketServer extends EventEmitter {
  readonly options: MockWebSocketServerOptions
  readonly handleUpgrade: jest.Mock

  constructor(options: MockWebSocketServerOptions) {
    super()
    this.options = options
    this.handleUpgrade = jest.fn(
      (
        request: IncomingMessage,
        socket: Duplex,
        head: Buffer,
        callback: MockUpgradeCallback
      ) => {
        if (mockHandleUpgrade) {
          return mockHandleUpgrade(this, request, socket, head, callback)
        }
        completeMockUpgrade(this, request, callback)
      }
    )
    mockWebSocketServers.push(this)
  }
}

jest.mock('next/dist/compiled/ws', () => ({
  Server: MockWebSocketServer,
}))

function createIncomingRequest(
  additionalHeaders: Record<string, string> = {}
): IncomingMessage {
  const headers = {
    host: 'example.test',
    connection: 'Upgrade',
    upgrade: 'websocket',
    'sec-websocket-key': Buffer.alloc(16).toString('base64'),
    'sec-websocket-version': '13',
    ...additionalHeaders,
  }
  return {
    method: 'GET',
    httpVersion: '1.1',
    headers,
    rawHeaders: Object.entries(headers).flatMap(([name, value]) => [
      name,
      value,
    ]),
  } as IncomingMessage
}

function createRequest(): NextRequest {
  return new Request('https://example.test/ws') as NextRequest
}

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

interface BeginUpgradeOptions {
  hooks?: WebSocketTransportHooks
  upgradeOptions?: { protocol?: string }
  responseHeaders?: HeadersInit
  transportOptions?: WebSocketUpgradeTransportOptions
  context?: WebSocketUpgradeTransportContext
  incomingRequest?: IncomingMessage
  request?: NextRequest
  socket?: PassThrough
  configureResponse?: (response: Response) => void
}

function beginUpgrade({
  hooks = {},
  upgradeOptions = {},
  responseHeaders,
  transportOptions,
  context,
  incomingRequest = createIncomingRequest(),
  request = createRequest(),
  socket = new PassThrough(),
  configureResponse,
}: BeginUpgradeOptions = {}) {
  const { createWebSocketUpgradeTransport } =
    require('./websocket-upgrade') as typeof import('./websocket-upgrade')
  const response = new Response()
  setWebSocketUpgradeMetadata(response, {
    hooks,
    ...(upgradeOptions.protocol === undefined
      ? undefined
      : { protocol: upgradeOptions.protocol }),
  })
  if (responseHeaders) {
    for (const [name, value] of new Headers(responseHeaders)) {
      response.headers.append(name, value)
    }
  }
  configureResponse?.(response)
  const transport = createWebSocketUpgradeTransport(transportOptions)
  const server = mockWebSocketServers[mockWebSocketServers.length - 1]
  const result = transport.handleUpgrade(
    incomingRequest,
    socket,
    Buffer.alloc(0),
    request,
    response,
    context
  )

  return { incomingRequest, request, response, result, server, socket }
}

async function openConnection(options: BeginUpgradeOptions = {}) {
  const upgrade = beginUpgrade(options)
  await expect(upgrade.result).resolves.toEqual({
    statusCode: 101,
    upgraded: true,
  })
  const websocket = mockWebSockets[mockWebSockets.length - 1]
  return { ...upgrade, websocket }
}

describe('WebSocket transport lifecycle', () => {
  beforeEach(() => {
    mockHandleUpgrade = undefined
    mockWebSocketServers = []
    mockWebSockets = []
    mockUpgradeHeaders = []
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.resetModules()
  })

  it('constructs the fixed parser policy and commits application headers with the handshake', async () => {
    const incomingRequest = createIncomingRequest({
      'sec-websocket-protocol': 'other, chat',
    })
    mockHandleUpgrade = (server, request, _socket, _head, callback) => {
      expect(
        server.options.handleProtocols(new Set(['other', 'chat']), request)
      ).toBe('chat')
      completeMockUpgrade(server, request, callback)
    }

    const { server, socket } = await openConnection({
      incomingRequest,
      upgradeOptions: { protocol: 'chat' },
      responseHeaders: {
        'set-cookie': 'first=1; Path=/, second=2; Path=/',
        'x-route': 'accepted',
      },
    })

    expect(server.options).toEqual({
      noServer: true,
      clientTracking: false,
      allowSynchronousEvents: false,
      autoPong: false,
      handleProtocols: expect.anything(),
      maxPayload: 16 * 1024 * 1024,
      perMessageDeflate: false,
      maxFragments: 1024,
      maxBufferedChunks: 1024,
      closeTimeout: 5_000,
    })
    expect(typeof server.options.handleProtocols).toBe('function')
    expect(server.listenerCount('wsClientError')).toBe(1)
    expect(server.listenerCount('headers')).toBe(1)
    expect(server.listenerCount('connection')).toBe(1)
    expect(mockUpgradeHeaders[0]).toEqual([
      'Upgrade: websocket',
      'Connection: Upgrade',
      'set-cookie: first=1; Path=/',
      'set-cookie: second=2; Path=/',
      'x-route: accepted',
    ])

    const { getRawHttpResponseStatus } =
      require('./websocket-http') as typeof import('./websocket-http')
    expect(getRawHttpResponseStatus(socket)).toBe(101)
    expect(
      server.options.handleProtocols(new Set(['chat']), incomingRequest)
    ).toBe(false)
    socket.destroy()
  })

  it('snapshots application handshake headers exactly once', async () => {
    let headerReads = 0
    const safeHeaders = new Headers({ 'x-route': 'accepted' })
    const shadowHeaders = new Headers({
      connection: 'close',
      'sec-websocket-protocol': 'shadowed',
    })

    const { socket } = await openConnection({
      configureResponse(response) {
        Object.defineProperty(response, 'headers', {
          configurable: true,
          get() {
            headerReads++
            return headerReads === 1 ? safeHeaders : shadowHeaders
          },
        })
      },
    })

    expect(headerReads).toBe(1)
    expect(mockUpgradeHeaders[0]).toEqual([
      'Upgrade: websocket',
      'Connection: Upgrade',
      'x-route: accepted',
    ])
    socket.destroy()
  })

  it('exposes the exact request and applies outbound byte limits without serializing objects', async () => {
    const request = createRequest()
    let peer!: WebSocketTransportPeer
    const socket = new PassThrough()
    Object.defineProperty(socket, 'remoteAddress', {
      configurable: true,
      value: '203.0.113.9',
    })
    const { websocket } = await openConnection({
      request,
      socket,
      transportOptions: {
        registerPeer(registeredPeer) {
          peer = registeredPeer
        },
      },
    })

    websocket.send.mockImplementation((data: string | Uint8Array) => {
      websocket.bufferedAmount +=
        typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength
    })
    expect(peer.request).toBe(request)
    expect(peer.remoteAddress).toBe('203.0.113.9')
    expect(peer.id).toBe(peer.id)
    expect('websocket' in peer).toBe(false)
    expect(peer.send('okay')).toBe(4)
    expect(websocket.send).toHaveBeenCalledWith('okay')

    const backing = Buffer.from([0xff, 1, 2, 3, 0xee])
    const view = backing.subarray(1, 4)
    peer.send(view)
    const copied = websocket.send.mock.calls.at(-1)?.[0] as Uint8Array
    expect(copied).not.toBe(view)
    expect(copied).toEqual(Buffer.from([1, 2, 3]))
    view.fill(9)
    expect(copied).toEqual(Buffer.from([1, 2, 3]))

    const toJSON = jest.fn()
    const value = {}
    Object.defineProperty(value, 'toJSON', { get: toJSON })
    expect(() => peer.send(value as never)).toThrow(
      'Serialize objects with JSON.stringify() before sending.'
    )
    expect(toJSON).not.toHaveBeenCalled()

    websocket.send.mockClear()
    websocket.bufferedAmount = 16 * 1024 * 1024 - 2
    expect(peer.send('abc')).toBe(16 * 1024 * 1024 - 2)
    expect(websocket.close).toHaveBeenCalledWith(
      1008,
      'WebSocket outbound buffer limit exceeded'
    )
    expect(websocket.send).not.toHaveBeenCalled()
    socket.destroy()
  })

  it('prevalidates the complete close argument contract without coercion', async () => {
    let peer!: WebSocketTransportPeer
    const { websocket, socket } = await openConnection({
      transportOptions: {
        registerPeer(registeredPeer) {
          peer = registeredPeer
        },
      },
    })
    const close = peer.close.bind(peer) as (
      code?: unknown,
      reason?: unknown
    ) => void
    const reset = () => {
      websocket.readyState = 1
      websocket.close.mockClear()
    }

    for (const code of [
      undefined,
      1000,
      1001,
      1002,
      1003,
      1007,
      1014,
      3000,
      4999,
    ]) {
      reset()
      expect(() => close(code)).not.toThrow()
      if (code === undefined) {
        expect(websocket.close).toHaveBeenCalledWith()
      } else {
        expect(websocket.close).toHaveBeenCalledWith(code, undefined)
      }
    }

    for (const reason of [
      undefined,
      '',
      'x'.repeat(123),
      '€'.repeat(41),
      `${'𐍈'.repeat(30)}abc`,
      '\ud800',
    ]) {
      reset()
      expect(Buffer.byteLength(reason ?? '')).toBeLessThanOrEqual(123)
      expect(() => close(1000, reason)).not.toThrow()
      expect(websocket.close).toHaveBeenCalledWith(1000, reason)
    }

    const valueOf = jest.fn(() => 1000)
    const toString = jest.fn(() => '1000')
    const invalidCodes: unknown[] = [
      999,
      1004,
      1005,
      1006,
      1015,
      2999,
      5000,
      1000.5,
      1006.5,
      3000.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0,
      '1000',
      BigInt(1000),
      Object(1000),
      { valueOf, toString },
      Symbol('1000'),
      true,
    ]
    for (const code of invalidCodes) {
      reset()
      expect(() => close(code)).toThrow(
        new TypeError('First argument must be a valid error code number')
      )
      expect(websocket.close).not.toHaveBeenCalled()
    }
    expect(valueOf).not.toHaveBeenCalled()
    expect(toString).not.toHaveBeenCalled()

    const lengthRead = jest.fn(() => {
      throw new Error('length must not be read')
    })
    const hostileReason = {}
    Object.defineProperty(hostileReason, 'length', { get: lengthRead })
    for (const reason of [
      Buffer.from('x'),
      new Uint8Array(1),
      Object('x'),
      5,
      null,
      Symbol('x'),
      {},
      hostileReason,
    ]) {
      reset()
      expect(() => close(1000, reason)).toThrow(
        new TypeError('Second argument must be a string')
      )
      expect(websocket.close).not.toHaveBeenCalled()
    }
    expect(lengthRead).not.toHaveBeenCalled()

    for (const reason of ['x'.repeat(124), '𐍈'.repeat(31)]) {
      reset()
      expect(() => close(1000, reason)).toThrow(
        new RangeError('The message must not be greater than 123 bytes')
      )
      expect(websocket.close).not.toHaveBeenCalled()
    }

    reset()
    expect(() => close(1000.5, Buffer.from('x'))).toThrow(
      new TypeError('First argument must be a valid error code number')
    )
    expect(websocket.close).not.toHaveBeenCalled()

    reset()
    expect(() => close(undefined, hostileReason)).not.toThrow()
    expect(lengthRead).not.toHaveBeenCalled()
    expect(websocket.close).toHaveBeenCalledWith()
    socket.destroy()
  })

  it('preserves close failures while resuming public and transport closes', async () => {
    const closeFailure = new Error('close failed after transition')
    let peer!: WebSocketTransportPeer
    let connection!: WebSocketTransportConnection
    const { websocket, socket } = await openConnection({
      transportOptions: {
        registerPeer(registeredPeer, registeredConnection) {
          peer = registeredPeer
          connection = registeredConnection
        },
      },
    })
    websocket.close.mockImplementation(() => {
      websocket.readyState = 2
      throw closeFailure
    })

    expect(() => peer.close(4000, 'public')).toThrow(closeFailure)
    expect(websocket.resume).toHaveBeenCalledTimes(1)

    websocket.readyState = 1
    websocket.resume.mockClear()
    expect(() => connection.close(1001)).toThrow(closeFailure)
    expect(websocket.resume).toHaveBeenCalledTimes(1)

    websocket.close.mockClear()
    websocket.resume.mockClear()
    websocket.readyState = 2
    expect(() => peer.close(4001, 'must-not-replace')).not.toThrow()
    expect(websocket.close).not.toHaveBeenCalled()
    expect(websocket.resume).toHaveBeenCalledTimes(1)
    socket.destroy()
  })

  it('resumes an already-closing transport without replacing its code', async () => {
    let peer!: WebSocketTransportPeer
    let connection!: WebSocketTransportConnection
    const { websocket, socket } = await openConnection({
      transportOptions: {
        registerPeer(registeredPeer, registeredConnection) {
          peer = registeredPeer
          connection = registeredConnection
        },
      },
    })

    peer.close(4000, 'selected')
    expect(websocket.close).toHaveBeenCalledWith(4000, 'selected')
    websocket.close.mockClear()
    websocket.resume.mockClear()

    connection.close(1012)
    expect(websocket.close).not.toHaveBeenCalled()
    expect(websocket.resume).toHaveBeenCalledTimes(1)
    websocket.emit('close', 4000, Buffer.from('selected'))
    socket.destroy()
  })

  it('resumes a paused receiver when outbound backpressure closes it', async () => {
    const messageStarted = createDeferred()
    const finishMessage = createDeferred()
    let peer!: WebSocketTransportPeer
    const { websocket, socket } = await openConnection({
      hooks: {
        async message() {
          messageStarted.resolve()
          await finishMessage.promise
        },
      },
      transportOptions: {
        registerPeer(registeredPeer) {
          peer = registeredPeer
        },
      },
    })

    websocket.emit('message', Buffer.from('pending'), false)
    await messageStarted.promise
    expect(websocket.pause).toHaveBeenCalledTimes(1)

    websocket.bufferedAmount = 16 * 1024 * 1024
    peer.send('overflow')
    expect(websocket.close).toHaveBeenCalledWith(
      1008,
      'WebSocket outbound buffer limit exceeded'
    )
    expect(websocket.resume).toHaveBeenCalledTimes(1)

    websocket.emit('close', 1008, Buffer.alloc(0))
    finishMessage.resolve()
    socket.destroy()
  })

  it('serializes message hooks and resumes only after the retained queue drains', async () => {
    const first = createDeferred()
    const second = createDeferred()
    const firstStarted = createDeferred()
    const secondStarted = createDeferred()
    const finished = createDeferred()
    const resumed = createDeferred()
    const invocations: string[] = []
    const { websocket, socket } = await openConnection({
      hooks: {
        async message(_peer, message) {
          invocations.push(message.text())
          if (invocations.length === 1) {
            firstStarted.resolve()
            await first.promise
          } else {
            secondStarted.resolve()
            await second.promise
            finished.resolve()
          }
        },
      },
    })
    websocket.resume.mockImplementation(resumed.resolve)

    websocket.emit('message', Buffer.from('first'), false)
    await firstStarted.promise
    websocket.emit('message', Buffer.from('second'), false)

    expect(websocket.pause).toHaveBeenCalledTimes(2)
    expect(invocations).toEqual(['first'])
    expect(websocket.resume).not.toHaveBeenCalled()

    first.resolve()
    await secondStarted.promise
    expect(websocket.resume).not.toHaveBeenCalled()
    second.resolve()
    await finished.promise
    await resumed.promise

    expect(invocations).toEqual(['first', 'second'])
    expect(websocket.resume).toHaveBeenCalledTimes(1)
    socket.destroy()
  })

  it.each(['close', 'terminate'] as const)(
    'drops retained messages after an application peer.%s()',
    async (method) => {
      const firstStarted = createDeferred()
      const queueDrained = createDeferred()
      const invocations: string[] = []
      const { websocket, socket } = await openConnection({
        hooks: {
          message(peer, message) {
            invocations.push(message.text())
            if (invocations.length === 1) {
              if (method === 'close') {
                peer.close(1008, 'stop')
              } else {
                peer.terminate()
              }
              firstStarted.resolve()
            }
          },
        },
      })
      websocket.resume.mockImplementation(queueDrained.resolve)

      websocket.emit('message', Buffer.from('first'), false)
      websocket.emit('message', Buffer.from('retained'), false)
      await firstStarted.promise
      if (method === 'close') {
        await queueDrained.promise
      } else {
        await new Promise<void>((resolve) => setImmediate(resolve))
      }

      expect(invocations).toEqual(['first'])
      expect(websocket.pause).toHaveBeenCalledTimes(2)
      if (method === 'close') {
        // close() transitions first and then resumes the receiver so the
        // transport can consume the peer's close echo.
        expect(websocket.resume).toHaveBeenCalledTimes(1)
        expect(websocket.close).toHaveBeenCalledWith(1008, 'stop')
      } else {
        expect(websocket.resume).not.toHaveBeenCalled()
        expect(websocket.terminate).toHaveBeenCalledTimes(1)
      }
      socket.destroy()
    }
  )

  it('copies an incoming binary view without exposing its backing-buffer sentinels', async () => {
    const received = createDeferred()
    const resumed = createDeferred()
    let message!: WebSocketTransportMessage
    const { websocket, socket } = await openConnection({
      hooks: {
        message(_peer, incomingMessage) {
          message = incomingMessage
          received.resolve()
        },
      },
    })
    websocket.resume.mockImplementation(resumed.resolve)
    const payload = Buffer.from('{"accepted":true}')
    const backing = Buffer.concat([
      Buffer.from('before:'),
      payload,
      Buffer.from(':after'),
    ])
    const view = backing.subarray(7, 7 + payload.byteLength)

    websocket.emit('message', view, true)
    view.fill(0)
    await received.promise
    await resumed.promise

    expect(Object.isFrozen(message)).toBe(true)
    expect(() => {
      ;(message as { rawData: string | Uint8Array }).rawData = 'replaced'
    }).toThrow(TypeError)
    expect(message.rawData).not.toBe(view)
    expect(message.uint8Array()).toBe(message.rawData)
    expect(Buffer.from(message.uint8Array())).toEqual(payload)
    expect(Buffer.from(message.arrayBuffer())).toEqual(payload)
    expect(message.text()).toBe('{"accepted":true}')
    expect(message.json()).toEqual({ accepted: true })
    socket.destroy()
  })

  it('closes when retained hooks exceed the count limit', async () => {
    const active = createDeferred()
    const started = createDeferred()
    const tasks: Promise<void>[] = []
    const message = jest.fn(async () => {
      started.resolve()
      await active.promise
    })
    const { websocket, socket } = await openConnection({
      hooks: { message },
      context: { trackTask: (task) => tasks.push(task) },
    })

    websocket.emit('message', Buffer.from('first'), false)
    await started.promise
    for (let index = 1; index < 32; index++) {
      websocket.emit('message', Buffer.from(String(index)), false)
    }
    websocket.emit('message', Buffer.from('overflow'), false)

    expect(websocket.pause).toHaveBeenCalledTimes(32)
    expect(websocket.resume).toHaveBeenCalledTimes(1)
    expect(websocket.close).toHaveBeenCalledWith(
      1008,
      'Too many pending messages'
    )
    expect(message).toHaveBeenCalledTimes(1)

    websocket.emit('close', 1008, Buffer.alloc(0))
    active.resolve()
    await Promise.all(tasks)
    expect(message).toHaveBeenCalledTimes(1)
    expect(websocket.resume).toHaveBeenCalledTimes(1)
    socket.destroy()
  })

  it('closes when retained hooks exceed the byte limit', async () => {
    const active = createDeferred()
    const started = createDeferred()
    const tasks: Promise<void>[] = []
    const message = jest.fn(async () => {
      started.resolve()
      await active.promise
    })
    const { websocket, socket } = await openConnection({
      hooks: { message },
      context: { trackTask: (task) => tasks.push(task) },
    })

    websocket.emit('message', Buffer.alloc(16 * 1024 * 1024), true)
    await started.promise
    websocket.emit('message', Buffer.from('x'), true)

    expect(websocket.pause).toHaveBeenCalledTimes(1)
    expect(websocket.resume).toHaveBeenCalledTimes(1)
    expect(websocket.close).toHaveBeenCalledWith(
      1008,
      'Too many pending messages'
    )

    websocket.emit('close', 1008, Buffer.alloc(0))
    active.resolve()
    await Promise.all(tasks)
    expect(message).toHaveBeenCalledTimes(1)
    socket.destroy()
  })

  it('transitions before resuming a failed message hook and reports the exact error', async () => {
    const hookError = new Error('message hook failed')
    const reported = createDeferred()
    const order: string[] = []
    const onHookError = jest.fn((error: unknown) => {
      expect(error).toBe(hookError)
      order.push('reported')
      reported.resolve()
    })
    const { websocket, socket } = await openConnection({
      hooks: {
        message() {
          throw hookError
        },
      },
      context: { onHookError },
    })
    websocket.pause.mockImplementation(() => order.push('pause'))
    websocket.resume.mockImplementation(() => order.push('resume'))
    websocket.close.mockImplementation(() => {
      order.push('close')
      websocket.readyState = 2
    })

    websocket.emit('message', Buffer.from('fail'), false)
    await reported.promise

    expect(order).toEqual(['pause', 'close', 'resume', 'reported'])
    expect(websocket.close).toHaveBeenCalledWith(
      1011,
      'WebSocket handler failed'
    )
    expect(onHookError).toHaveBeenCalledTimes(1)
    socket.destroy()
  })

  it('preserves an application-selected close code when its hook rejects', async () => {
    const hookError = new Error('failed after close')
    const reported = createDeferred()
    const onHookError = jest.fn((error: unknown) => {
      expect(error).toBe(hookError)
      reported.resolve()
    })
    const { websocket, socket } = await openConnection({
      hooks: {
        message(peer) {
          peer.close(4000, 'selected')
          throw hookError
        },
      },
      context: { onHookError },
    })

    websocket.emit('message', Buffer.from('close-then-fail'), false)
    await reported.promise

    expect(websocket.close).toHaveBeenCalledTimes(1)
    expect(websocket.close).toHaveBeenCalledWith(4000, 'selected')
    expect(websocket.resume).toHaveBeenCalledTimes(2)
    socket.destroy()
  })

  it('does not start retained messages after a terminal transport error', async () => {
    const active = createDeferred()
    const started = createDeferred()
    const tasks: Promise<void>[] = []
    const transportError = new Error('transport failed')
    const message = jest.fn(async () => {
      started.resolve()
      await active.promise
    })
    const error = jest.fn((_peer, receivedError: Error) => {
      expect(receivedError).toBe(transportError)
    })
    const { websocket, socket } = await openConnection({
      hooks: { message, error },
      context: { trackTask: (task) => tasks.push(task) },
    })

    websocket.emit('message', Buffer.from('active'), false)
    await started.promise
    websocket.emit('message', Buffer.from('retained'), false)
    websocket.emit('error', transportError)
    active.resolve()
    await Promise.all(tasks)

    expect(message).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
    expect(websocket.pause).toHaveBeenCalledTimes(2)
    expect(websocket.resume).toHaveBeenCalledTimes(1)
    expect(websocket.close).toHaveBeenCalledWith(
      1011,
      'WebSocket transport failed'
    )
    socket.destroy()
  })

  it('preserves transport error identity and serializes error before close', async () => {
    const transportError = new Error('transport failed')
    const hookError = new Error('error hook failed')
    const events: string[] = []
    const tasks: Promise<void>[] = []
    const registerPeer = jest.fn()
    const unregisterPeer = jest.fn()
    const onHookError = jest.fn(async (error: unknown) => {
      expect(error).toBe(hookError)
      events.push('reported')
    })
    const error = jest.fn(async (_peer, receivedError: Error) => {
      expect(receivedError).toBe(transportError)
      events.push('error')
      throw hookError
    })
    const close = jest.fn(() => {
      events.push('close')
    })
    const { websocket, socket } = await openConnection({
      hooks: { error, close },
      transportOptions: { registerPeer, unregisterPeer },
      context: {
        onHookError,
        trackTask: (task) => tasks.push(task),
      },
    })

    websocket.readyState = 2
    websocket.emit('error', transportError)
    websocket.emit('close', 1006, Buffer.alloc(0))
    await Promise.all(tasks)

    expect(events).toEqual(['error', 'reported', 'close'])
    expect(error).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith(expect.anything(), {
      code: 1006,
      reason: '',
    })
    expect(websocket.close).not.toHaveBeenCalled()
    expect(websocket.terminate).not.toHaveBeenCalled()
    expect(registerPeer).toHaveBeenCalledTimes(1)
    expect(unregisterPeer).toHaveBeenCalledTimes(1)
    socket.destroy()
  })

  it('contains unregister failures without suppressing close-hook tracking', async () => {
    const unregisterFailure = new Error('unregister failed')
    const events: string[] = []
    const tasks: Promise<void>[] = []
    const { websocket, socket } = await openConnection({
      hooks: {
        close() {
          events.push('close')
        },
      },
      transportOptions: {
        unregisterPeer() {
          throw unregisterFailure
        },
      },
      context: {
        onHookError(error) {
          expect(error).toBe(unregisterFailure)
          events.push('reported')
        },
        trackTask(task) {
          tasks.push(task)
        },
      },
    })

    expect(() => websocket.emit('close', 1000, Buffer.alloc(0))).not.toThrow()
    await Promise.all(tasks)
    expect(events).toEqual(['reported', 'close'])
    socket.destroy()
  })

  it('installs all transport listeners before admission and suppresses refused hooks', async () => {
    const open = jest.fn()
    const message = jest.fn()
    const error = jest.fn()
    const close = jest.fn()
    const unregisterPeer = jest.fn()
    const registerPeer = jest.fn(
      (
        peer: WebSocketTransportPeer,
        connection: WebSocketTransportConnection
      ) => {
        const websocket = mockWebSockets[mockWebSockets.length - 1]
        expect('websocket' in peer).toBe(false)
        expect(connection.getReadyState()).toBe(1)
        expect(Object.isFrozen(connection)).toBe(true)
        expect(websocket.listenerCount('error')).toBe(1)
        expect(websocket.listenerCount('close')).toBe(1)
        expect(websocket.listenerCount('message')).toBe(1)
        expect(websocket.listenerCount('ping')).toBe(1)
        connection.close(1012)
        expect(connection.getReadyState()).toBe(2)
        return false
      }
    )
    const { websocket, socket } = await openConnection({
      hooks: { open, message, error, close },
      transportOptions: { registerPeer, unregisterPeer },
    })

    websocket.emit('message', Buffer.from('ignored'), false)
    websocket.emit('error', new Error('ignored'))
    websocket.emit('close', 1012, Buffer.from('scope closed'))
    await Promise.resolve()

    expect(registerPeer).toHaveBeenCalledTimes(1)
    expect(websocket.close).toHaveBeenCalledWith(1012)
    expect(open).not.toHaveBeenCalled()
    expect(message).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(unregisterPeer).not.toHaveBeenCalled()
    socket.destroy()
  })

  it('preserves a registration error thrown after the 101 commit and destroys the socket', async () => {
    const registrationError = new Error('registration refused unexpectedly')
    const registerPeer = jest.fn(
      (
        peer: WebSocketTransportPeer,
        connection: WebSocketTransportConnection
      ) => {
        const websocket = mockWebSockets[mockWebSockets.length - 1]
        expect('websocket' in peer).toBe(false)
        expect(connection.getReadyState()).toBe(1)
        expect(websocket.listenerCount('error')).toBe(1)
        expect(websocket.listenerCount('close')).toBe(1)
        expect(websocket.listenerCount('message')).toBe(1)
        expect(websocket.listenerCount('ping')).toBe(1)
        throw registrationError
      }
    )
    const { result, socket } = beginUpgrade({
      transportOptions: { registerPeer },
    })

    await expect(result).rejects.toBe(registrationError)
    const { getRawHttpResponseStatus } =
      require('./websocket-http') as typeof import('./websocket-http')
    expect(getRawHttpResponseStatus(socket)).toBe(101)
    expect(socket.destroyed).toBe(true)
    expect(registerPeer).toHaveBeenCalledTimes(1)
  })

  it('owns ws client validation errors without allowing a hidden raw response', async () => {
    const clientError = new Error('ws rejected the handshake')
    mockHandleUpgrade = (server) => {
      server.emit('wsClientError', clientError)
    }
    const { result, server, socket } = beginUpgrade()

    await expect(result).rejects.toBe(clientError)
    const { getRawHttpResponseStatus } =
      require('./websocket-http') as typeof import('./websocket-http')
    expect(server.listenerCount('wsClientError')).toBe(1)
    expect(getRawHttpResponseStatus(socket)).toBeUndefined()
    expect(socket.destroyed).toBe(false)
    socket.destroy()
  })

  it('preserves a headers-phase exception and destroys an already-committed socket', async () => {
    mockHandleUpgrade = (server, request) => {
      const headers: string[] = []
      server.emit('headers', headers, request)
      server.emit('headers', headers, request)
    }
    const { result, socket } = beginUpgrade()

    await expect(result).rejects.toThrow(
      'Invariant: raw HTTP response already committed with status 101.'
    )
    const { getRawHttpResponseStatus } =
      require('./websocket-http') as typeof import('./websocket-http')
    expect(getRawHttpResponseStatus(socket)).toBe(101)
    expect(socket.destroyed).toBe(true)
  })

  it('manually pongs within the outbound policy and closes on backpressure', async () => {
    const { websocket, socket } = await openConnection()
    const ping = Buffer.from('heartbeat')

    websocket.emit('ping', ping)
    expect(websocket.pong).toHaveBeenCalledWith(ping)
    expect(websocket.close).not.toHaveBeenCalled()

    websocket.bufferedAmount = 16 * 1024 * 1024
    websocket.emit('ping', Buffer.from('x'))
    expect(websocket.pong).toHaveBeenCalledTimes(1)
    expect(websocket.close).toHaveBeenCalledWith(
      1008,
      'WebSocket outbound buffer limit exceeded'
    )
    socket.destroy()
  })

  it('requires both the ws callback and the raw 101 commit', async () => {
    mockHandleUpgrade = (_server, _request, _socket, _head, callback) => {
      const websocket = new MockWebSocket()
      mockWebSockets.push(websocket)
      callback(websocket)
    }
    const callbackOnly = beginUpgrade()
    await expect(callbackOnly.result).rejects.toThrow(
      'WebSocket upgrade client disconnected.'
    )
    const { getRawHttpResponseStatus } =
      require('./websocket-http') as typeof import('./websocket-http')
    expect(getRawHttpResponseStatus(callbackOnly.socket)).toBeUndefined()
    callbackOnly.socket.destroy()

    mockHandleUpgrade = (server, request) => {
      const headers: string[] = []
      mockUpgradeHeaders.push(headers)
      server.emit('headers', headers, request)
    }
    const commitOnly = beginUpgrade()
    await expect(commitOnly.result).rejects.toThrow(
      'WebSocket upgrade client disconnected.'
    )
    expect(getRawHttpResponseStatus(commitOnly.socket)).toBe(101)
    commitOnly.socket.destroy()
  })
})
