import { once } from 'node:events'
import { createServer, type IncomingMessage } from 'node:http'
import { connect, type Socket } from 'node:net'

import ws from 'next/dist/compiled/ws'

import { NextRequest } from './web/spec-extension/request'
import { setWebSocketUpgradeMetadata } from './web/spec-extension/websocket-upgrade-response'
import {
  createWebSocketUpgradeTransport,
  type WebSocketTransportConnection,
  type WebSocketTransportHooks,
  type WebSocketTransportMessage,
  type WebSocketTransportPeer,
  type WebSocketUpgradeTransportContext,
  type WebSocketUpgradeTransportOptions,
  type WebSocketUpgradeTransportOutcome,
} from './websocket-upgrade'
import { getRawHttpResponseStatus } from './websocket-http'

const MAX_OUTBOUND_BUFFER_BYTES = 16 * 1024 * 1024
const VALID_KEY = Buffer.from('0123456789abcdef').toString('base64')

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

interface UpgradeSettlement {
  outcome?: WebSocketUpgradeTransportOutcome
  error?: Error
  socket: Socket
}

interface TransportHarness {
  port: number
  request: NextRequest
  waitForUpgrade(index?: number): Promise<UpgradeSettlement>
  trackClient(client: ws): void
  trackSocket(socket: Socket): void
  close(): Promise<void>
}

interface TransportHarnessOptions {
  hooks?: WebSocketTransportHooks
  upgradeOptions?: { protocol?: string }
  responseHeaders?: Array<[string, string]>
  request?: NextRequest
  transportOptions?: WebSocketUpgradeTransportOptions
  context?: WebSocketUpgradeTransportContext
  beforeUpgrade?: (request: IncomingMessage, socket: Socket) => void
  upgradeAttempts?: number
}

interface ServerFrame {
  fin: boolean
  masked: boolean
  opcode: number
  payload: Buffer
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

class SocketBytes {
  private buffer = Buffer.alloc(0)
  private ended = false
  private terminalError: Error | undefined
  private waiters = new Set<() => void>()

  constructor(socket: Socket) {
    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.wake()
    })
    socket.on('end', () => {
      this.ended = true
      this.wake()
    })
    socket.on('close', () => {
      this.ended = true
      this.wake()
    })
    socket.on('error', (error) => {
      this.terminalError = error
      this.ended = true
      this.wake()
    })
  }

  async readUntil(marker: Buffer): Promise<Buffer> {
    for (;;) {
      const index = this.buffer.indexOf(marker)
      if (index !== -1) {
        const end = index + marker.byteLength
        const value = this.buffer.subarray(0, end)
        this.buffer = this.buffer.subarray(end)
        return value
      }
      await this.waitForData()
    }
  }

  async readFrame(): Promise<ServerFrame> {
    for (;;) {
      const frame = this.tryReadFrame()
      if (frame) return frame
      await this.waitForData()
    }
  }

  async readToEnd(): Promise<Buffer> {
    while (!this.ended) {
      await new Promise<void>((resolve) => this.waiters.add(resolve))
    }
    return this.buffer
  }

  private tryReadFrame(): ServerFrame | undefined {
    if (this.buffer.byteLength < 2) return undefined

    const first = this.buffer[0]
    const second = this.buffer[1]
    const masked = (second & 0x80) !== 0
    let payloadLength = second & 0x7f
    let offset = 2
    if (payloadLength === 126) {
      if (this.buffer.byteLength < 4) return undefined
      payloadLength = this.buffer.readUInt16BE(2)
      offset = 4
    } else if (payloadLength === 127) {
      if (this.buffer.byteLength < 10) return undefined
      const length = this.buffer.readBigUInt64BE(2)
      if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new RangeError('Frame is too large for the test reader.')
      }
      payloadLength = Number(length)
      offset = 10
    }

    const maskLength = masked ? 4 : 0
    if (this.buffer.byteLength < offset + maskLength + payloadLength) {
      return undefined
    }

    const mask = masked ? this.buffer.subarray(offset, offset + 4) : undefined
    offset += maskLength
    const payload = Buffer.from(
      this.buffer.subarray(offset, offset + payloadLength)
    )
    this.buffer = this.buffer.subarray(offset + payloadLength)
    if (mask) {
      for (let index = 0; index < payload.byteLength; index++) {
        payload[index] ^= mask[index & 3]
      }
    }

    return {
      fin: (first & 0x80) !== 0,
      masked,
      opcode: first & 0x0f,
      payload,
    }
  }

  private async waitForData(): Promise<void> {
    if (this.terminalError) throw this.terminalError
    if (this.ended)
      throw new Error('Socket ended before the expected bytes arrived.')
    await new Promise<void>((resolve) => this.waiters.add(resolve))
  }

  private wake(): void {
    const waiters = [...this.waiters]
    this.waiters.clear()
    for (const resolve of waiters) resolve()
  }
}

function clientFrame(
  opcode: number,
  data: string | Uint8Array = Buffer.alloc(0),
  options: { fin?: boolean; rsv1?: boolean } = {}
): Buffer {
  const payload =
    typeof data === 'string'
      ? Buffer.from(data)
      : Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78])
  const extendedLength = payload.byteLength < 126 ? 0 : 2
  const frame = Buffer.alloc(2 + extendedLength + 4 + payload.byteLength)
  frame[0] =
    (options.fin === false ? 0 : 0x80) | (options.rsv1 ? 0x40 : 0) | opcode
  if (extendedLength === 0) {
    frame[1] = 0x80 | payload.byteLength
  } else {
    frame[1] = 0x80 | 126
    frame.writeUInt16BE(payload.byteLength, 2)
  }
  mask.copy(frame, 2 + extendedLength)
  for (let index = 0; index < payload.byteLength; index++) {
    frame[2 + extendedLength + 4 + index] = payload[index] ^ mask[index & 3]
  }
  return frame
}

function closePayload(code?: number, reason = ''): Buffer {
  if (code === undefined) return Buffer.alloc(0)
  const payload = Buffer.alloc(2 + Buffer.byteLength(reason))
  payload.writeUInt16BE(code)
  payload.write(reason, 2)
  return payload
}

function readClose(frame: ServerFrame): { code: number; reason: string } {
  expect(frame.opcode).toBe(0x08)
  if (frame.payload.byteLength === 0) return { code: 1005, reason: '' }
  return {
    code: frame.payload.readUInt16BE(0),
    reason: frame.payload.subarray(2).toString('utf8'),
  }
}

function rawHeaderValues(rawHeaders: string[], name: string): string[] {
  const values: string[] = []
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index].toLowerCase() === name.toLowerCase()) {
      values.push(rawHeaders[index + 1])
    }
  }
  return values
}

async function createTransportHarness(
  options: TransportHarnessOptions = {}
): Promise<TransportHarness> {
  const request =
    options.request ??
    new NextRequest('http://normalized.example/ws?rewritten=1', {
      headers: { authorization: 'Bearer normalized' },
    })
  const response = new Response()
  setWebSocketUpgradeMetadata(response, {
    hooks: options.hooks ?? {},
    ...(options.upgradeOptions?.protocol === undefined
      ? undefined
      : { protocol: options.upgradeOptions.protocol }),
  })
  for (const [name, value] of options.responseHeaders ?? []) {
    response.headers.append(name, value)
  }

  const transport = createWebSocketUpgradeTransport(options.transportOptions)
  const serverSockets = new Set<Socket>()
  const clientSockets = new Set<Socket>()
  const clients = new Set<ws>()
  const settlements = new Map<number, Deferred<UpgradeSettlement>>()
  let upgradeIndex = 0

  const getSettlement = (index: number) => {
    let settlement = settlements.get(index)
    if (!settlement) {
      settlement = deferred<UpgradeSettlement>()
      settlements.set(index, settlement)
    }
    return settlement
  }

  const server = createServer()
  server.on('connection', (socket) => {
    serverSockets.add(socket)
    socket.once('close', () => serverSockets.delete(socket))
  })
  server.on('upgrade', (incoming, upgradedSocket, head) => {
    const socket = upgradedSocket as Socket
    options.beforeUpgrade?.(incoming, socket)
    for (let attempt = 0; attempt < (options.upgradeAttempts ?? 1); attempt++) {
      const index = upgradeIndex++
      void transport
        .handleUpgrade(
          incoming,
          socket,
          head,
          request,
          response,
          options.context
        )
        .then(
          (outcome) => getSettlement(index).resolve({ outcome, socket }),
          (error: Error) => {
            getSettlement(index).resolve({ error, socket })
            if (!socket.destroyed) socket.destroy()
          }
        )
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected the transport test server to use a TCP port.')
  }

  return {
    port: address.port,
    request,
    waitForUpgrade(index = 0) {
      return getSettlement(index).promise
    },
    trackClient(client) {
      clients.add(client)
      client.once('close', () => clients.delete(client))
    },
    trackSocket(socket) {
      clientSockets.add(socket)
      socket.once('close', () => clientSockets.delete(socket))
    },
    async close() {
      for (const client of clients) {
        if (client.readyState === ws.CONNECTING) {
          client.terminate()
        } else if (client.readyState !== ws.CLOSED) {
          client.terminate()
        }
      }
      for (const socket of clientSockets) socket.destroy()
      for (const socket of serverSockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

async function openWebSocket(
  harness: TransportHarness,
  protocols?: string | string[]
): Promise<{ client: ws; response: IncomingMessage }> {
  const client = new ws(
    `ws://127.0.0.1:${harness.port}/raw?source=client`,
    protocols
  )
  harness.trackClient(client)
  const response = deferred<IncomingMessage>()
  client.once('upgrade', response.resolve)
  await once(client, 'open')
  return { client, response: await response.promise }
}

function rawHandshakeRequest(
  harness: TransportHarness,
  options: { protocol?: string; key?: string; extensions?: string } = {}
): Buffer {
  const lines = [
    'GET /raw?source=client HTTP/1.1',
    `Host: 127.0.0.1:${harness.port}`,
    'Connection: Upgrade',
    'Upgrade: websocket',
    `Sec-WebSocket-Key: ${options.key ?? VALID_KEY}`,
    'Sec-WebSocket-Version: 13',
  ]
  if (options.protocol) {
    lines.push(`Sec-WebSocket-Protocol: ${options.protocol}`)
  }
  if (options.extensions) {
    lines.push(`Sec-WebSocket-Extensions: ${options.extensions}`)
  }
  return Buffer.from(`${lines.join('\r\n')}\r\n\r\n`)
}

async function connectRaw(harness: TransportHarness): Promise<{
  socket: Socket
  bytes: SocketBytes
}> {
  const socket = connect({ host: '127.0.0.1', port: harness.port })
  harness.trackSocket(socket)
  const bytes = new SocketBytes(socket)
  await once(socket, 'connect')
  return { socket, bytes }
}

async function openRaw(
  harness: TransportHarness,
  head: Uint8Array = Buffer.alloc(0)
): Promise<{ socket: Socket; bytes: SocketBytes; headers: string }> {
  const { socket, bytes } = await connectRaw(harness)
  socket.write(Buffer.concat([rawHandshakeRequest(harness), head]))
  const headers = (await bytes.readUntil(Buffer.from('\r\n\r\n'))).toString()
  expect(headers).toMatch(/^HTTP\/1\.1 101 Switching Protocols\r\n/)
  return { socket, bytes, headers }
}

async function collectMessages(
  client: ws,
  count: number
): Promise<Array<{ data: Buffer; isBinary: boolean }>> {
  const messages: Array<{ data: Buffer; isBinary: boolean }> = []
  return new Promise((resolve) => {
    client.on('message', (data, isBinary) => {
      const buffer = Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.isBuffer(data)
          ? data
          : Buffer.from(data as ArrayBuffer)
      messages.push({ data: buffer, isBinary })
      if (messages.length === count) resolve(messages)
    })
  })
}

describe('Next-owned WebSocket upgrade transport', () => {
  const harnesses: TransportHarness[] = []

  afterEach(async () => {
    jest.useRealTimers()
    await Promise.all(harnesses.splice(0).map((instance) => instance.close()))
  })

  async function harness(options: TransportHarnessOptions = {}) {
    const instance = await createTransportHarness(options)
    harnesses.push(instance)
    return instance
  }

  it('writes the complete 101 and preserves request, protocol, and peer identity', async () => {
    const peers: WebSocketTransportPeer[] = []
    const openedPeers: WebSocketTransportPeer[] = []
    const opened = deferred<void>()
    const instance = await harness({
      upgradeOptions: { protocol: 'chat' },
      responseHeaders: [
        ['x-transport', 'owned'],
        ['set-cookie', 'alpha=1; Path=/'],
        ['set-cookie', 'beta=2; Path=/'],
      ],
      hooks: {
        open(peer) {
          openedPeers.push(peer)
          if (openedPeers.length === 2) opened.resolve()
        },
      },
      transportOptions: {
        registerPeer(peer) {
          peers.push(peer)
        },
      },
    })

    const first = await openWebSocket(instance, ['other', 'chat'])
    const second = await openWebSocket(instance, ['chat'])
    await opened.promise
    const firstResult = await instance.waitForUpgrade(0)
    const secondResult = await instance.waitForUpgrade(1)

    expect(firstResult.outcome).toEqual({ statusCode: 101, upgraded: true })
    expect(secondResult.outcome).toEqual({ statusCode: 101, upgraded: true })
    expect(getRawHttpResponseStatus(firstResult.socket)).toBe(101)
    expect(first.response.statusCode).toBe(101)
    expect(first.response.headers['sec-websocket-accept']).toBeTruthy()
    expect(first.response.headers['sec-websocket-protocol']).toBe('chat')
    expect(first.response.headers['sec-websocket-extensions']).toBeUndefined()
    expect(first.response.headers['x-transport']).toBe('owned')
    expect(rawHeaderValues(first.response.rawHeaders, 'set-cookie')).toEqual([
      'alpha=1; Path=/',
      'beta=2; Path=/',
    ])
    expect(peers).toHaveLength(2)
    expect(openedPeers[0]).toBe(peers[0])
    expect(openedPeers[1]).toBe(peers[1])
    expect(peers[0].request).toBe(instance.request)
    expect(peers[0].request.headers.get('authorization')).toBe(
      'Bearer normalized'
    )
    expect(peers[0].remoteAddress).toBe('127.0.0.1')
    expect(peers[0].id).toBe(peers[0].id)
    expect(peers[0].id).not.toBe(peers[1].id)
    expect(first.client.protocol).toBe('chat')
    expect(second.client.protocol).toBe('chat')
    expect(first.client.extensions).toBe('')
    expect(second.client.extensions).toBe('')
  })

  it('rejects non-ASCII application headers before committing handshake bytes', async () => {
    const instance = await harness({
      responseHeaders: [['x-label', 'café']],
    })
    const { socket, bytes } = await connectRaw(instance)
    socket.write(rawHandshakeRequest(instance))

    const settlement = await instance.waitForUpgrade()
    expect(settlement.error).toEqual(
      new TypeError(
        'WebSocket upgrade response header "x-label" must contain only visible ASCII characters, spaces, and tabs.'
      )
    )
    expect(getRawHttpResponseStatus(settlement.socket)).toBeUndefined()
    await expect(bytes.readToEnd()).resolves.toEqual(Buffer.alloc(0))
  })

  it('preserves text, binary, view-boundary, and conversion contracts', async () => {
    const messages: WebSocketTransportMessage[] = []
    const received = deferred<void>()
    const instance = await harness({
      hooks: {
        message(_peer, message) {
          messages.push(message)
          if (messages.length === 2) received.resolve()
        },
      },
    })
    const { client } = await openWebSocket(instance)
    client.send('{"value":0}')
    const backing = Buffer.allocUnsafeSlow(32)
    const view = backing.subarray(11, 16)
    view.set(Buffer.from('hello'))
    client.send(view)
    await received.promise

    expect(messages[0].rawData).toBe('{"value":0}')
    expect(messages[0].uint8Array()).toBe(messages[0].uint8Array())
    expect(messages[0].text()).toBe('{"value":0}')
    expect(messages[0].json()).toBe(messages[0].json())
    expect(messages[0].json()).toEqual({ value: 0 })
    expect(messages[1].rawData).toBeInstanceOf(Uint8Array)
    expect(Buffer.from(messages[1].rawData as Uint8Array).toString()).toBe(
      'hello'
    )
    expect(messages[1].uint8Array()).toBe(messages[1].rawData)
    expect(messages[1].arrayBuffer()).toBe(messages[1].arrayBuffer())
    expect(messages[1].arrayBuffer()).toBeInstanceOf(ArrayBuffer)
    expect(messages[1].arrayBuffer().byteLength).toBe(5)
    expect(messages[1].text()).toBe('hello')
    expect(() => messages[1].json()).toThrow(SyntaxError)
  })

  it('normalizes every supported outbound data type without inspecting objects', async () => {
    const peerReady = deferred<WebSocketTransportPeer>()
    const instance = await harness({
      transportOptions: { registerPeer: peerReady.resolve },
    })
    const { client } = await openWebSocket(instance)
    const peer = await peerReady.promise
    const received = collectMessages(client, 5)
    const backing = Buffer.from([0xff, 1, 2, 3, 0xee])
    const arrayBuffer = Uint8Array.from([4, 5]).buffer
    const shared = new SharedArrayBuffer(2)
    new Uint8Array(shared).set([6, 7])
    const dataViewBacking = Uint8Array.from([0xff, 8, 9, 0xee]).buffer

    peer.send('text')
    peer.send(backing.subarray(1, 4))
    peer.send(arrayBuffer)
    peer.send(shared)
    peer.send(new DataView(dataViewBacking, 1, 2))
    expect(await received).toEqual([
      { data: Buffer.from('text'), isBinary: false },
      { data: Buffer.from([1, 2, 3]), isBinary: true },
      { data: Buffer.from([4, 5]), isBinary: true },
      { data: Buffer.from([6, 7]), isBinary: true },
      { data: Buffer.from([8, 9]), isBinary: true },
    ])

    const toJSON = jest.fn()
    const value = {}
    Object.defineProperty(value, 'toJSON', { get: toJSON })
    expect(() => peer.send(value as never)).toThrow(
      'Serialize objects with JSON.stringify() before sending.'
    )
    expect(toJSON).not.toHaveBeenCalled()
  })

  it('enforces the outbound message limit', async () => {
    const tooLargePeer = deferred<WebSocketTransportPeer>()
    const tooLargeHarness = await harness({
      transportOptions: { registerPeer: tooLargePeer.resolve },
    })
    const tooLargeClient = await openWebSocket(tooLargeHarness)
    const tooLargeClosed = deferred<{ code: number; reason: string }>()
    tooLargeClient.client.once('close', (code, reason) =>
      tooLargeClosed.resolve({ code, reason: reason.toString() })
    )
    ;(await tooLargePeer.promise).send(
      Buffer.alloc(MAX_OUTBOUND_BUFFER_BYTES + 1)
    )
    await expect(tooLargeClosed.promise).resolves.toEqual({
      code: 1009,
      reason: 'WebSocket message is too large',
    })
  })

  it('prevalidates close arguments without coercion and writes the exact valid close', async () => {
    const peerReady = deferred<WebSocketTransportPeer>()
    const connectionReady = deferred<WebSocketTransportConnection>()
    const closeHook = deferred<{ code: number; reason: string }>()
    const instance = await harness({
      hooks: { close: (_peer, details) => closeHook.resolve(details) },
      transportOptions: {
        registerPeer(peer, connection) {
          peerReady.resolve(peer)
          connectionReady.resolve(connection)
        },
      },
    })
    const { socket, bytes } = await openRaw(instance)
    const peer = await peerReady.promise
    const connection = await connectionReady.promise
    expect('websocket' in peer).toBe(false)

    const close = peer.close.bind(peer) as (
      code?: unknown,
      reason?: unknown
    ) => void
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
      4999.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0,
      Object(4000),
      '4000',
      BigInt(4000),
      true,
      null,
      Symbol('4000'),
    ]
    const valueOf = jest.fn(() => 4000)
    const toString = jest.fn(() => '4000')
    invalidCodes.push({ valueOf, toString })
    for (const code of invalidCodes) {
      expect(() => close(code)).toThrow(
        new TypeError('First argument must be a valid error code number')
      )
      expect(connection.getReadyState()).toBe(ws.OPEN)
    }
    expect(valueOf).not.toHaveBeenCalled()
    expect(toString).not.toHaveBeenCalled()

    const lengthRead = jest.fn(() => {
      throw new Error('length must not be read')
    })
    const hostileReason = {}
    Object.defineProperty(hostileReason, 'length', { get: lengthRead })
    const invalidReasons: unknown[] = [
      Object('reason'),
      Buffer.from('reason'),
      new Uint8Array(1),
      1,
      null,
      Symbol('reason'),
      {},
      { toString: () => 'reason' },
      hostileReason,
    ]
    for (const reason of invalidReasons) {
      expect(() => close(4000, reason)).toThrow(
        new TypeError('Second argument must be a string')
      )
      expect(connection.getReadyState()).toBe(ws.OPEN)
    }
    expect(lengthRead).not.toHaveBeenCalled()

    const reason124 = `${'é'.repeat(61)}ab`
    expect(Buffer.byteLength(reason124)).toBe(124)
    expect(() => close(4000, reason124)).toThrow(
      new RangeError('The message must not be greater than 123 bytes')
    )
    expect(connection.getReadyState()).toBe(ws.OPEN)
    expect(() => close(4000, '𐍈'.repeat(31))).toThrow(
      new RangeError('The message must not be greater than 123 bytes')
    )
    expect(connection.getReadyState()).toBe(ws.OPEN)
    expect(() => close(1000.5, Buffer.from('reason'))).toThrow(
      new TypeError('First argument must be a valid error code number')
    )

    close(3000, 'ok')
    expect(connection.getReadyState()).toBe(ws.CLOSING)
    expect(() => close(1006.5)).toThrow(
      new TypeError('First argument must be a valid error code number')
    )
    expect(readClose(await bytes.readFrame())).toEqual({
      code: 3000,
      reason: 'ok',
    })
    socket.write(clientFrame(0x08, closePayload(3000, 'ok')))
    await expect(closeHook.promise).resolves.toEqual({
      code: 3000,
      reason: 'ok',
    })
    const bufferedAmount = peer.bufferedAmount
    expect(peer.send('after-close')).toBe(bufferedAmount)
    expect(peer.bufferedAmount).toBe(bufferedAmount)
  })

  it('accepts a 123-byte UTF-8 close reason and ignores a reason without a code', async () => {
    const peers: WebSocketTransportPeer[] = []
    const instance = await harness({
      transportOptions: {
        registerPeer(peer) {
          peers.push(peer)
        },
      },
    })

    const first = await openRaw(instance)
    expect(peers).toHaveLength(1)
    const reason123 = `${'é'.repeat(61)}a`
    expect(Buffer.byteLength(reason123)).toBe(123)
    peers[0].close(4001, reason123)
    expect(readClose(await first.bytes.readFrame())).toEqual({
      code: 4001,
      reason: reason123,
    })

    const second = await openRaw(instance)
    expect(peers).toHaveLength(2)
    const untouched = {
      toString() {
        throw new Error('reason must not be observed without a code')
      },
    }
    ;(
      peers[1].close.bind(peers[1]) as (
        code?: unknown,
        reason?: unknown
      ) => void
    )(undefined, untouched)
    expect(readClose(await second.bytes.readFrame())).toEqual({
      code: 1005,
      reason: '',
    })
  })

  it('accepts every public close-code range boundary', async () => {
    const peers: WebSocketTransportPeer[] = []
    const instance = await harness({
      transportOptions: {
        registerPeer(peer) {
          peers.push(peer)
        },
      },
    })

    for (const code of [1000, 1014, 3000, 4999]) {
      const opened = await openRaw(instance)
      const peer = peers.at(-1)!
      peer.close(code)
      expect(readClose(await opened.bytes.readFrame())).toEqual({
        code,
        reason: '',
      })
      opened.socket.destroy()
    }
  })

  it('delivers head bytes first and reassembles fragmented binary data', async () => {
    const messages: WebSocketTransportMessage[] = []
    const received = deferred<void>()
    const instance = await harness({
      hooks: {
        message(_peer, message) {
          messages.push(message)
          if (messages.length === 2) received.resolve()
        },
      },
    })
    const { socket } = await openRaw(instance, clientFrame(0x01, 'head'))
    socket.write(
      Buffer.concat([
        clientFrame(0x02, Buffer.from('ab'), { fin: false }),
        clientFrame(0x00, Buffer.from('cd')),
      ])
    )
    await received.promise

    expect(messages[0].rawData).toBe('head')
    expect(Buffer.from(messages[1].rawData as Uint8Array).toString()).toBe(
      'abcd'
    )
    expect(messages[1].arrayBuffer().byteLength).toBe(4)
  })

  it('enforces the vendored fragment and buffered-chunk limits', async () => {
    const accepted = deferred<WebSocketTransportMessage>()
    const fragmentHarness = await harness({
      hooks: { message: (_peer, message) => accepted.resolve(message) },
    })
    const allowed = await openRaw(fragmentHarness)
    allowed.socket.write(
      Buffer.concat([
        clientFrame(0x02, Buffer.alloc(0), { fin: false }),
        ...Array.from({ length: 1022 }, () =>
          clientFrame(0x00, Buffer.alloc(0), { fin: false })
        ),
        clientFrame(0x00),
      ])
    )
    expect((await accepted.promise).uint8Array()).toHaveLength(0)

    const fragmentError = deferred<Error>()
    const rejectedHarness = await harness({
      hooks: { error: (_peer, error) => fragmentError.resolve(error) },
    })
    const rejected = await openRaw(rejectedHarness)
    rejected.socket.write(
      Buffer.concat([
        clientFrame(0x02, Buffer.alloc(0), { fin: false }),
        ...Array.from({ length: 1024 }, () =>
          clientFrame(0x00, Buffer.alloc(0), { fin: false })
        ),
      ])
    )
    const fragmentClose = readClose(await rejected.bytes.readFrame())
    expect(fragmentClose).toEqual({ code: 1008, reason: '' })
    expect(
      ((await fragmentError.promise) as Error & { code?: string }).code
    ).toBe('WS_ERR_TOO_MANY_BUFFERED_PARTS')
    rejected.socket.write(clientFrame(0x08, closePayload(fragmentClose.code)))

    let observedData: Deferred<void> | undefined
    const chunkAccepted = deferred<WebSocketTransportMessage>()
    const chunkError = deferred<Error>()
    const chunkHarness = await harness({
      beforeUpgrade(_request, socket) {
        socket.on('data', () => {
          observedData?.resolve()
          observedData = undefined
        })
      },
      hooks: {
        message: (_peer, message) => chunkAccepted.resolve(message),
        error: (_peer, error) => chunkError.resolve(error),
      },
    })
    const writeObservedFrame = async (
      target: Awaited<ReturnType<typeof openRaw>>,
      frame: Buffer
    ) => {
      const headerLength = 8
      const writeObserved = async (chunk: Buffer) => {
        observedData = deferred<void>()
        target.socket.write(chunk)
        await observedData.promise
      }
      await writeObserved(frame.subarray(0, headerLength))
      for (const byte of frame.subarray(headerLength)) {
        await writeObserved(Buffer.of(byte))
      }
    }

    const acceptedChunked = await openRaw(chunkHarness)
    await writeObservedFrame(
      acceptedChunked,
      clientFrame(0x02, Buffer.alloc(1024))
    )
    expect((await chunkAccepted.promise).uint8Array()).toHaveLength(1024)

    const chunked = await openRaw(chunkHarness)
    await writeObservedFrame(chunked, clientFrame(0x02, Buffer.alloc(1025)))
    const chunkClose = readClose(await chunked.bytes.readFrame())
    expect(chunkClose).toEqual({ code: 1008, reason: '' })
    expect(((await chunkError.promise) as Error & { code?: string }).code).toBe(
      'WS_ERR_TOO_MANY_BUFFERED_PARTS'
    )
    chunked.socket.write(clientFrame(0x08, closePayload(chunkClose.code)))
  })

  it('uses the vendored five-second close timeout', async () => {
    const peerReady = deferred<WebSocketTransportPeer>()
    const connectionReady = deferred<WebSocketTransportConnection>()
    const instance = await harness({
      transportOptions: {
        registerPeer(peer, connection) {
          peerReady.resolve(peer)
          connectionReady.resolve(connection)
        },
      },
    })
    const { bytes } = await openRaw(instance)
    const peer = await peerReady.promise
    const connection = await connectionReady.promise
    const closed = deferred<void>()
    connection.onClose(closed.resolve)

    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    peer.close(1000)
    expect(readClose(await bytes.readFrame())).toEqual({
      code: 1000,
      reason: '',
    })
    expect(connection.getReadyState()).toBe(ws.CLOSING)
    jest.advanceTimersByTime(4_999)
    expect(connection.getReadyState()).toBe(ws.CLOSING)
    jest.advanceTimersByTime(1)
    await closed.promise
    expect(connection.getReadyState()).toBe(ws.CLOSED)
  })

  it('serializes coalesced frames while retaining the 32-message admission cap', async () => {
    const stalled = deferred<void>()
    const firstHook = deferred<void>()
    const thirdHook = deferred<void>()
    const messages: string[] = []
    let activeHooks = 0
    let maximumActiveHooks = 0
    const instance = await harness({
      hooks: {
        async message(_peer, message) {
          activeHooks++
          maximumActiveHooks = Math.max(maximumActiveHooks, activeHooks)
          const text = message.text()
          messages.push(text)
          if (text === 'one') {
            firstHook.resolve()
            await stalled.promise
          }
          activeHooks--
          if (text === 'three') thirdHook.resolve()
        },
      },
    })
    const { socket } = await openRaw(instance)
    socket.write(
      Buffer.concat([
        clientFrame(0x01, 'one'),
        clientFrame(0x01, 'two'),
        clientFrame(0x01, 'three'),
      ])
    )
    await firstHook.promise
    expect(messages).toEqual(['one'])
    stalled.resolve()
    await thirdHook.promise
    expect(messages).toEqual(['one', 'two', 'three'])
    expect(maximumActiveHooks).toBe(1)

    const cappedHook = deferred<void>()
    const capInstance = await harness({
      hooks: { message: () => cappedHook.promise },
    })
    const capped = await openRaw(capInstance)
    capped.socket.write(
      Buffer.concat(
        Array.from({ length: 33 }, (_, index) =>
          clientFrame(0x01, String(index % 10))
        )
      )
    )
    const close = readClose(await capped.bytes.readFrame())
    expect(close).toEqual({ code: 1008, reason: 'Too many pending messages' })
    const socketClosed = once(capped.socket, 'close')
    capped.socket.write(clientFrame(0x08, closePayload(close.code)))
    await socketClosed
    cappedHook.resolve()
  })

  it('drops coalesced messages after an application close and completes the close handshake', async () => {
    const invocations: string[] = []
    const closed = deferred<{ code: number; reason: string }>()
    const instance = await harness({
      hooks: {
        message(peer, message) {
          invocations.push(message.text())
          if (invocations.length === 1) peer.close(1000)
        },
        close(_peer, details) {
          closed.resolve(details)
        },
      },
    })
    const { socket, bytes } = await openRaw(instance)

    socket.write(
      Buffer.concat([
        clientFrame(0x01, 'first'),
        clientFrame(0x01, 'must-not-run'),
      ])
    )

    const close = readClose(await bytes.readFrame())
    expect(close).toEqual({ code: 1000, reason: '' })
    socket.write(clientFrame(0x08, closePayload(close.code)))
    await expect(closed.promise).resolves.toEqual({ code: 1000, reason: '' })
    expect(invocations).toEqual(['first'])
  })

  it('preserves an application close code when the message hook then rejects', async () => {
    const hookError = new Error('failed after selecting close code')
    const reported = deferred<unknown>()
    const instance = await harness({
      hooks: {
        message(peer) {
          peer.close(4000, 'selected')
          throw hookError
        },
      },
      context: {
        onHookError(error) {
          reported.resolve(error)
        },
      },
    })
    const { socket, bytes } = await openRaw(instance)

    socket.write(clientFrame(0x01, 'close-then-fail'))
    const close = readClose(await bytes.readFrame())
    expect(close).toEqual({ code: 4000, reason: 'selected' })
    await expect(reported.promise).resolves.toBe(hookError)

    socket.write(clientFrame(0x08, closePayload(close.code)))
  })

  it('drops coalesced messages after an application terminate', async () => {
    const invocations: string[] = []
    const closed = deferred<{ code: number; reason: string }>()
    const instance = await harness({
      hooks: {
        message(peer, message) {
          invocations.push(message.text())
          if (invocations.length === 1) peer.terminate()
        },
        close(_peer, details) {
          closed.resolve(details)
        },
      },
    })
    const { socket } = await openRaw(instance)

    socket.write(
      Buffer.concat([
        clientFrame(0x01, 'first'),
        clientFrame(0x01, 'must-not-run'),
      ])
    )

    await expect(closed.promise).resolves.toEqual({ code: 1006, reason: '' })
    expect(invocations).toEqual(['first'])
  })

  it('completes a transport close while a paused message hook is pending', async () => {
    const messageStarted = deferred<void>()
    const finishMessage = deferred<void>()
    const transportClosed = deferred<void>()
    let connection!: WebSocketTransportConnection
    const instance = await harness({
      hooks: {
        async message() {
          messageStarted.resolve()
          await finishMessage.promise
        },
      },
      transportOptions: {
        registerPeer(_peer, registeredConnection) {
          connection = registeredConnection
        },
      },
    })
    const { socket, bytes } = await openRaw(instance)
    socket.write(clientFrame(0x01, 'pause'))
    await messageStarted.promise

    connection.onClose(() => transportClosed.resolve())
    connection.close(1001)
    const close = readClose(await bytes.readFrame())
    expect(close).toEqual({
      code: 1001,
      reason: '',
    })
    socket.write(clientFrame(0x08, closePayload(close.code)))
    await transportClosed.promise

    finishMessage.resolve()
  })

  it('orders a coalesced message before its policy-guarded ping', async () => {
    const events: string[] = []
    const messageStarted = deferred<void>()
    const stalledHook = deferred<void>()
    const instance = await harness({
      hooks: {
        async message() {
          events.push('message-hook')
          messageStarted.resolve()
          await stalledHook.promise
        },
      },
    })
    const { socket, bytes } = await openRaw(instance)
    const payload = Buffer.from([0xde, 0xad])
    socket.write(
      Buffer.concat([clientFrame(0x01, 'message'), clientFrame(0x09, payload)])
    )
    await messageStarted.promise
    const pong = await bytes.readFrame()
    events.push('pong')

    expect(events).toEqual(['message-hook', 'pong'])
    expect(pong).toEqual({
      fin: true,
      masked: false,
      opcode: 0x0a,
      payload,
    })
    stalledHook.resolve()
  })

  it('answers a ping with one byte-identical unmasked pong', async () => {
    const instance = await harness()
    const { socket, bytes } = await openRaw(instance)
    const payload = Buffer.from([0xde, 0xad])
    socket.write(
      Buffer.concat([
        clientFrame(0x09, payload),
        clientFrame(0x08, closePayload(1000)),
      ])
    )

    const pong = await bytes.readFrame()
    expect(pong).toEqual({
      fin: true,
      masked: false,
      opcode: 0x0a,
      payload,
    })
    expect(readClose(await bytes.readFrame())).toEqual({
      code: 1000,
      reason: '',
    })
  })

  it('rejects a duplicate upgrade on the same socket without a second response', async () => {
    const instance = await harness({ upgradeAttempts: 2 })
    const { socket, bytes } = await connectRaw(instance)
    socket.write(rawHandshakeRequest(instance))
    const headers = await bytes.readUntil(Buffer.from('\r\n\r\n'))
    const first = await instance.waitForUpgrade(0)
    const second = await instance.waitForUpgrade(1)

    expect(first.outcome).toEqual({ statusCode: 101, upgraded: true })
    expect(second.error?.message).toContain(
      'server.handleUpgrade() was called more than once with the same socket'
    )
    expect(getRawHttpResponseStatus(second.socket)).toBe(101)
    expect(headers.toString().match(/HTTP\/1\.1 101/g)).toHaveLength(1)
    expect(await bytes.readToEnd()).toHaveLength(0)
  })

  it('refuses admission through the lifecycle capability without exposing the transport', async () => {
    let registrationCompleted = false
    const errorHook = jest.fn()
    const closeHook = jest.fn()
    const lifecycleClosed = deferred<void>()
    const instance = await harness({
      hooks: { error: errorHook, close: closeHook },
      transportOptions: {
        registerPeer(peer, connection) {
          expect('websocket' in peer).toBe(false)
          expect(Object.isFrozen(connection)).toBe(true)
          expect(connection.getReadyState()).toBe(ws.OPEN)
          connection.onClose(lifecycleClosed.resolve)
          connection.close(1012)
          expect(connection.getReadyState()).toBe(ws.CLOSING)
          registrationCompleted = true
          return false
        },
      },
    })
    const { socket, bytes } = await openRaw(instance)
    expect(registrationCompleted).toBe(true)
    expect((await instance.waitForUpgrade()).outcome).toEqual({
      statusCode: 101,
      upgraded: true,
    })
    const close = readClose(await bytes.readFrame())
    expect(close).toEqual({ code: 1012, reason: '' })
    expect(errorHook).not.toHaveBeenCalled()
    expect(closeHook).not.toHaveBeenCalled()
    socket.write(clientFrame(0x08, closePayload(close.code)))
    await lifecycleClosed.promise
  })

  it('classifies a dead socket instead of reporting a successful upgrade', async () => {
    const instance = await harness({
      beforeUpgrade(_request, socket) {
        socket.destroy()
      },
    })
    const { socket, bytes } = await connectRaw(instance)
    socket.write(rawHandshakeRequest(instance))
    const settlement = await instance.waitForUpgrade()

    expect(settlement.error).toEqual(
      new Error('WebSocket upgrade client disconnected.')
    )
    expect(getRawHttpResponseStatus(settlement.socket)).toBeUndefined()
    expect(await bytes.readToEnd()).toHaveLength(0)
  })

  it('keeps wsClientError failures under Next raw-response ownership', async () => {
    let keyReads = 0
    const instance = await harness({
      beforeUpgrade(request) {
        const headers = request.headers
        request.headers = new Proxy(headers, {
          get(target, property, receiver) {
            if (property === 'sec-websocket-key') {
              return keyReads++ === 0 ? VALID_KEY : 'invalid-after-validation'
            }
            return Reflect.get(target, property, receiver)
          },
        })
      },
    })
    const { socket, bytes } = await connectRaw(instance)
    socket.write(rawHandshakeRequest(instance))
    const settlement = await instance.waitForUpgrade()

    expect(settlement.error?.message).toBe(
      'Missing or invalid Sec-WebSocket-Key header'
    )
    expect(getRawHttpResponseStatus(settlement.socket)).toBeUndefined()
    expect(await bytes.readToEnd()).toHaveLength(0)
  })

  it('rejects malformed extension grammar as a Next-owned 400 response', async () => {
    const instance = await harness()
    const { socket, bytes } = await connectRaw(instance)
    socket.write(
      rawHandshakeRequest(instance, {
        extensions: 'permessage-deflate; =bad',
      })
    )

    const settlement = await instance.waitForUpgrade()
    expect(settlement).toMatchObject({
      outcome: { statusCode: 400, upgraded: false },
    })
    expect(settlement.error).toBeUndefined()
    expect(getRawHttpResponseStatus(settlement.socket)).toBe(400)
    expect((await bytes.readToEnd()).toString()).toContain(
      'Invalid Sec-WebSocket-Extensions header.'
    )
  })

  it('preserves the parser error shape and its protocol-selected close code', async () => {
    const hookError = deferred<Error>()
    const instance = await harness({
      hooks: { error: (_peer, error) => hookError.resolve(error) },
    })
    const { socket, bytes } = await openRaw(instance)
    socket.write(clientFrame(0x01, 'invalid-rsv1', { rsv1: true }))

    const close = readClose(await bytes.readFrame())
    const observed = await hookError.promise
    expect(close.code).toBe(1002)
    expect(observed).toBeInstanceOf(Error)
    expect((observed as Error & { code?: string }).code).toBe(
      'WS_ERR_UNEXPECTED_RSV_1'
    )
    expect(observed.stack).toContain('RSV1 must be clear')
  })

  it('rejects invalid UTF-8 text with one 1007 close and one error settlement', async () => {
    const messageHook = jest.fn()
    const errorHook = jest.fn()
    const closeHook = jest.fn()
    const errorObserved = deferred<Error>()
    const closeObserved = deferred<{ code: number; reason: string }>()
    const instance = await harness({
      hooks: {
        message: messageHook,
        error(peer, error) {
          errorHook(peer, error)
          errorObserved.resolve(error)
        },
        close(peer, details) {
          closeHook(peer, details)
          closeObserved.resolve(details)
        },
      },
    })
    const { socket, bytes } = await openRaw(instance)

    socket.write(clientFrame(0x01, Buffer.from([0xc3, 0x28])))

    const close = readClose(await bytes.readFrame())
    const observed = await errorObserved.promise
    expect(close).toEqual({ code: 1007, reason: '' })
    expect(observed).toBeInstanceOf(Error)
    expect((observed as Error & { code?: string }).code).toBe(
      'WS_ERR_INVALID_UTF8'
    )
    expect(observed.stack).toContain('invalid UTF-8 sequence')
    expect(messageHook).not.toHaveBeenCalled()
    expect(errorHook).toHaveBeenCalledTimes(1)

    socket.write(clientFrame(0x08, closePayload(close.code)))
    await expect(closeObserved.promise).resolves.toEqual({
      code: 1006,
      reason: '',
    })
    expect(errorHook).toHaveBeenCalledTimes(1)
    expect(closeHook).toHaveBeenCalledTimes(1)
  })

  it('rejects an invalid UTF-8 close reason with one 1007 close and one error settlement', async () => {
    const errorHook = jest.fn()
    const closeHook = jest.fn()
    const errorObserved = deferred<Error>()
    const closeObserved = deferred<{ code: number; reason: string }>()
    const instance = await harness({
      hooks: {
        error(peer, error) {
          errorHook(peer, error)
          errorObserved.resolve(error)
        },
        close(peer, details) {
          closeHook(peer, details)
          closeObserved.resolve(details)
        },
      },
    })
    const { socket, bytes } = await openRaw(instance)
    const invalidReason = Buffer.from([0xc3, 0x28])
    const payload = Buffer.allocUnsafe(2 + invalidReason.byteLength)
    payload.writeUInt16BE(1000)
    invalidReason.copy(payload, 2)

    socket.write(clientFrame(0x08, payload))

    const close = readClose(await bytes.readFrame())
    const observed = await errorObserved.promise
    expect(close).toEqual({ code: 1007, reason: '' })
    expect(observed).toBeInstanceOf(Error)
    expect((observed as Error & { code?: string }).code).toBe(
      'WS_ERR_INVALID_UTF8'
    )
    expect(observed.stack).toContain('invalid UTF-8 sequence')
    expect(errorHook).toHaveBeenCalledTimes(1)

    socket.write(clientFrame(0x08, closePayload(close.code)))
    await expect(closeObserved.promise).resolves.toEqual({
      code: 1006,
      reason: '',
    })
    expect(errorHook).toHaveBeenCalledTimes(1)
    expect(closeHook).toHaveBeenCalledTimes(1)
  })

  it('reports a client close code and reason exactly', async () => {
    const closed = deferred<{
      details: { code: number; reason: string }
      remoteAddress: string | undefined
    }>()
    const instance = await harness({
      hooks: {
        close: (peer, details) =>
          closed.resolve({ details, remoteAddress: peer.remoteAddress }),
      },
    })
    const { client } = await openWebSocket(instance)
    const clientClosed = once(client, 'close')
    client.close(4001, 'bye')
    await expect(closed.promise).resolves.toEqual({
      details: { code: 4001, reason: 'bye' },
      remoteAddress: '127.0.0.1',
    })
    await clientClosed
  })

  it('reports an empty close frame as 1005', async () => {
    const closed = deferred<{ code: number; reason: string }>()
    const instance = await harness({
      hooks: { close: (_peer, details) => closed.resolve(details) },
    })
    const { socket, bytes } = await openRaw(instance)
    socket.write(clientFrame(0x08))

    expect(readClose(await bytes.readFrame())).toEqual({
      code: 1005,
      reason: '',
    })
    await expect(closed.promise).resolves.toEqual({ code: 1005, reason: '' })
  })

  it('reports abrupt TCP loss only as close 1006', async () => {
    const closed = deferred<{ code: number; reason: string }>()
    const error = jest.fn()
    const instance = await harness({
      hooks: {
        error,
        close: (_peer, details) => closed.resolve(details),
      },
    })
    const { socket } = await openRaw(instance)
    socket.destroy()

    await expect(closed.promise).resolves.toEqual({ code: 1006, reason: '' })
    expect(error).not.toHaveBeenCalled()
  })
})
