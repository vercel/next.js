import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { types } from 'node:util'
import type {
  Server as WebSocketServer,
  ServerOptions as WebSocketServerOptions,
  WebSocket as VendoredWebSocket,
} from 'ws'

import type { NextRequest } from './web/spec-extension/request'
import type { WebSocketUpgradeMetadata } from './web/spec-extension/websocket-upgrade-response'
import { getWebSocketUpgradeMetadata } from './web/spec-extension/websocket-upgrade-response'
import {
  createWebSocketClientDisconnectError,
  getRawHttpResponseStatus,
  getUpgradeResponseHeaderLines,
  markRawHttpResponseCommitted,
  validateWebSocketHandshake,
  validateWebSocketRequestPolicy,
  writeRawHttpError,
} from './websocket-http'

type WebSocketServerConstructor = typeof WebSocketServer

interface VendoredWebSocketServerOptions extends WebSocketServerOptions {
  closeTimeout: number
  maxBufferedChunks: number
  maxFragments: number
}

interface WebSocketTransportDependencies {
  WebSocketServer: WebSocketServerConstructor
}

let webSocketTransportDependencies: WebSocketTransportDependencies | undefined

function loadWebSocketTransportDependencies(): WebSocketTransportDependencies {
  if (webSocketTransportDependencies) return webSocketTransportDependencies

  const WebSocketServer = (
    require('next/dist/compiled/ws') as typeof import('next/dist/compiled/ws')
  ).Server
  return (webSocketTransportDependencies = { WebSocketServer })
}

const MAX_PAYLOAD = 16 * 1024 * 1024
const MAX_FRAGMENTS = 1024
const MAX_BUFFERED_CHUNKS = 1024
const MAX_PENDING_MESSAGE_HOOKS = 32
const MAX_PENDING_MESSAGE_BYTES = 16 * 1024 * 1024
const MAX_OUTBOUND_BUFFER_BYTES = 16 * 1024 * 1024
const WS_CLOSE_TIMEOUT_MS = 5_000
const textEncoder = new TextEncoder()
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype)
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'buffer'
)!.get!
const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteOffset'
)!.get!
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteLength'
)!.get!
const typedArraySet = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'set'
)!.value as (source: ArrayLike<number>, offset?: number) => void
const dataViewBufferGetter = Object.getOwnPropertyDescriptor(
  DataView.prototype,
  'buffer'
)!.get!
const dataViewByteOffsetGetter = Object.getOwnPropertyDescriptor(
  DataView.prototype,
  'byteOffset'
)!.get!
const dataViewByteLengthGetter = Object.getOwnPropertyDescriptor(
  DataView.prototype,
  'byteLength'
)!.get!
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'byteLength'
)!.get!
const sharedArrayBufferByteLengthGetter =
  typeof SharedArrayBuffer === 'undefined'
    ? undefined
    : Object.getOwnPropertyDescriptor(
        SharedArrayBuffer.prototype,
        'byteLength'
      )!.get!
const EMPTY_OUTBOUND_PAYLOAD = Buffer.alloc(0)

export type WebSocketTransportMessageData =
  | string
  | ArrayBuffer
  | SharedArrayBuffer
  | ArrayBufferView

export interface WebSocketTransportPeer {
  readonly id: string
  readonly remoteAddress: string | undefined
  readonly request: NextRequest
  readonly bufferedAmount: number
  close(code?: number, reason?: string): void
  terminate(): void
  send(data: WebSocketTransportMessageData): number
}

export interface WebSocketTransportMessage {
  readonly rawData: string | Uint8Array
  uint8Array(): Uint8Array
  arrayBuffer(): ArrayBuffer
  text(): string
  json<T = unknown>(): T
}

export interface WebSocketTransportHooks {
  open?: (peer: WebSocketTransportPeer) => void | Promise<void>
  message?: (
    peer: WebSocketTransportPeer,
    message: WebSocketTransportMessage
  ) => void | Promise<void>
  close?: (
    peer: WebSocketTransportPeer,
    details: { code: number; reason: string }
  ) => void | Promise<void>
  error?: (peer: WebSocketTransportPeer, error: Error) => void | Promise<void>
}

interface WebSocketTransportUpgradeMetadata extends WebSocketUpgradeMetadata {
  readonly hooks: Readonly<WebSocketTransportHooks>
}

export interface WebSocketTransportConnection {
  getReadyState(): number
  onClose(listener: () => void): () => void
  /** Starts or resumes a graceful close without replacing an existing code. */
  close(code?: number): void
  terminate(): void
}

export interface WebSocketUpgradeTransportContext {
  onHookError?: (error: unknown) => void | Promise<void>
  trackTask?: (promise: Promise<void>) => void
}

export interface WebSocketUpgradeTransportOptions {
  registerPeer?: (
    peer: WebSocketTransportPeer,
    connection: WebSocketTransportConnection,
    context: WebSocketUpgradeTransportContext
  ) => boolean | void
  unregisterPeer?: (
    peer: WebSocketTransportPeer,
    connection: WebSocketTransportConnection,
    context: WebSocketUpgradeTransportContext
  ) => void
}

export interface WebSocketUpgradeTransportOutcome {
  statusCode: number
  upgraded: boolean
}

export interface WebSocketUpgradeTransport {
  handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    request: NextRequest,
    response: Response,
    context?: WebSocketUpgradeTransportContext
  ): Promise<WebSocketUpgradeTransportOutcome>
}

interface ConnectionContext {
  metadata: WebSocketTransportUpgradeMetadata
  transportContext: WebSocketUpgradeTransportContext
  hookQueue: Promise<void>
  pendingMessages: number
  pendingMessageBytes: number
  closed: boolean
  hookFailed: boolean
  applicationHooksEnabled: boolean
}

interface PendingUpgrade {
  socket: Duplex
  protocol: string | undefined
  headerLines: string[]
  connection: ConnectionContext
  request: NextRequest
}

type MeasuredWebSocketData =
  | {
      kind: 'string'
      data: string
      byteLength: number
    }
  | {
      kind: 'bytes'
      buffer: ArrayBuffer | SharedArrayBuffer
      byteOffset: number
      byteLength: number
    }

interface WebSocketConnection {
  peer: NextWebSocketPeer
  websocket: VendoredWebSocket
  transportConnection: WebSocketTransportConnection
}

class NextWebSocketMessage implements WebSocketTransportMessage {
  readonly rawData: string | Uint8Array
  #bytes: Uint8Array | undefined
  #buffer: ArrayBuffer | undefined
  #string: string | undefined
  #parsed: { value: unknown } | undefined

  constructor(rawData: string | Uint8Array) {
    this.rawData = rawData
    Object.freeze(this)
  }

  uint8Array(): Uint8Array {
    return (this.#bytes ??=
      typeof this.rawData === 'string'
        ? textEncoder.encode(this.rawData)
        : this.rawData)
  }

  arrayBuffer(): ArrayBuffer {
    if (this.#buffer) return this.#buffer

    const view = this.uint8Array()
    const buffer = view.buffer
    if (buffer instanceof ArrayBuffer) {
      return (this.#buffer =
        view.byteOffset === 0 && view.byteLength === buffer.byteLength
          ? buffer
          : buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))
    }

    // Keep the public conversion aligned with platform arrayBuffer() APIs even
    // if a future transport supplies a SharedArrayBuffer-backed view.
    const copy = new Uint8Array(view.byteLength)
    copy.set(view)
    return (this.#buffer = copy.buffer)
  }

  text(): string {
    return (this.#string ??=
      typeof this.rawData === 'string'
        ? this.rawData
        : Buffer.from(
            this.rawData.buffer,
            this.rawData.byteOffset,
            this.rawData.byteLength
          ).toString('utf8'))
  }

  json<T = unknown>(): T {
    if (!this.#parsed) {
      this.#parsed = { value: JSON.parse(this.text()) }
    }
    return this.#parsed.value as T
  }
}

class NextWebSocketPeer implements WebSocketTransportPeer {
  readonly #websocket: VendoredWebSocket
  readonly #request: NextRequest
  readonly remoteAddress: string | undefined
  #id: string | undefined

  constructor(
    websocket: VendoredWebSocket,
    request: NextRequest,
    socket: Duplex
  ) {
    this.#websocket = websocket
    this.#request = request
    this.remoteAddress = (
      socket as Duplex & { remoteAddress?: string }
    ).remoteAddress
  }

  get id(): string {
    return (this.#id ??= randomUUID())
  }

  get request(): NextRequest {
    return this.#request
  }

  get bufferedAmount(): number {
    return getWebSocketBufferedAmount(this.#websocket)
  }

  send(data: WebSocketTransportMessageData): number {
    const bufferedAmount = getWebSocketBufferedAmount(this.#websocket)
    if (!isWebSocketOpen(this.#websocket)) return bufferedAmount

    const measured = measureWebSocketData(data)
    if (measured.byteLength > MAX_OUTBOUND_BUFFER_BYTES) {
      closeWebSocketForOutboundFailure(
        this.#websocket,
        1009,
        'WebSocket message is too large'
      )
      return bufferedAmount
    }
    if (bufferedAmount > MAX_OUTBOUND_BUFFER_BYTES - measured.byteLength) {
      closeWebSocketForOutboundFailure(
        this.#websocket,
        1008,
        'WebSocket outbound buffer limit exceeded'
      )
      return bufferedAmount
    }

    this.#websocket.send(materializeWebSocketData(measured))
    return getWebSocketBufferedAmount(this.#websocket)
  }

  close(code?: number, reason?: string): void {
    if (code !== undefined) {
      if (typeof code !== 'number' || !isValidCloseCode(code)) {
        throw new TypeError('First argument must be a valid error code number')
      }
      if (reason !== undefined) {
        if (typeof reason !== 'string') {
          throw new TypeError('Second argument must be a string')
        }
        if (Buffer.byteLength(reason) > 123) {
          throw new RangeError('The message must not be greater than 123 bytes')
        }
      }
    }
    closeAndResumeWebSocket(this.#websocket, () => {
      if (code === undefined) this.#websocket.close()
      else this.#websocket.close(code, reason)
    })
  }

  terminate(): void {
    this.#websocket.terminate()
  }
}

function isValidCloseCode(code: number): boolean {
  return (
    Number.isInteger(code) &&
    ((code >= 1000 &&
      code <= 1014 &&
      code !== 1004 &&
      code !== 1005 &&
      code !== 1006) ||
      (code >= 3000 && code <= 4999))
  )
}

async function reportHookError(
  connection: ConnectionContext,
  error: unknown
): Promise<void> {
  try {
    await connection.transportContext.onHookError?.(error)
  } catch (reportError) {
    console.error('Failed to report WebSocket hook error', reportError)
  }
}

function pauseConnection(connection: WebSocketConnection): void {
  try {
    connection.websocket.pause()
  } catch {}
}

function resumeConnection(connection: WebSocketConnection): void {
  resumeWebSocket(connection.websocket)
}

function resumeWebSocket(websocket: VendoredWebSocket): void {
  try {
    websocket.resume()
  } catch {}
}

/**
 * Starts a graceful close before resuming a paused receiver. Calling close()
 * first preserves ws's state transition and selected code; a transport which
 * is already CLOSING is only resumed so its peer's close frame can be read.
 */
function closeAndResumeWebSocket(
  websocket: VendoredWebSocket,
  close: () => void
): void {
  const readyState = websocket.readyState
  if (readyState === 3) return
  if (readyState === 2) {
    resumeWebSocket(websocket)
    return
  }

  try {
    close()
  } finally {
    if (websocket.readyState === 2) resumeWebSocket(websocket)
  }
}

function closeWebSocketAfterFailure(
  websocket: VendoredWebSocket,
  code: number,
  reason: string
): void {
  try {
    closeAndResumeWebSocket(websocket, () => websocket.close(code, reason))
  } catch {
    try {
      websocket.terminate()
    } catch {}
  }
}

function closeConnectionAfterFailure(
  connection: WebSocketConnection,
  reason: string
): void {
  closeWebSocketAfterFailure(connection.websocket, 1011, reason)
}

async function invokeHook(
  owned: WebSocketConnection,
  connection: ConnectionContext,
  invoke: () => void | Promise<void>,
  closeOnError: boolean
): Promise<void> {
  try {
    await invoke()
  } catch (error) {
    if (closeOnError) {
      connection.hookFailed = true
      closeConnectionAfterFailure(owned, 'WebSocket handler failed')
    }
    await reportHookError(connection, error)
  }
}

function queueHook(
  owned: WebSocketConnection,
  connection: ConnectionContext,
  invoke: () => void | Promise<void>,
  closeOnError: boolean
): Promise<void> {
  connection.hookQueue = connection.hookQueue.then(() =>
    invokeHook(owned, connection, invoke, closeOnError)
  )
  return connection.hookQueue
}

function getMessageByteLength(message: WebSocketTransportMessage): number {
  const data = message.rawData
  return typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength
}

function measureWebSocketData(data: unknown): MeasuredWebSocketData {
  if (typeof data === 'string') {
    return { kind: 'string', data, byteLength: Buffer.byteLength(data) }
  }
  if (types.isTypedArray(data)) {
    return {
      kind: 'bytes',
      buffer: typedArrayBufferGetter.call(data),
      byteOffset: typedArrayByteOffsetGetter.call(data),
      byteLength: typedArrayByteLengthGetter.call(data),
    }
  }
  if (types.isDataView(data)) {
    return {
      kind: 'bytes',
      buffer: dataViewBufferGetter.call(data),
      byteOffset: dataViewByteOffsetGetter.call(data),
      byteLength: dataViewByteLengthGetter.call(data),
    }
  }
  if (types.isArrayBuffer(data)) {
    return {
      kind: 'bytes',
      buffer: data,
      byteOffset: 0,
      byteLength: arrayBufferByteLengthGetter.call(data),
    }
  }
  if (sharedArrayBufferByteLengthGetter && types.isSharedArrayBuffer(data)) {
    return {
      kind: 'bytes',
      buffer: data,
      byteOffset: 0,
      byteLength: sharedArrayBufferByteLengthGetter.call(data),
    }
  }
  throw new TypeError(
    'Invalid WebSocket data: expected a string or binary data. Serialize objects with JSON.stringify() before sending.'
  )
}

function materializeWebSocketData(
  measured: MeasuredWebSocketData
): string | Buffer {
  if (measured.kind === 'string') {
    return measured.data
  }
  if (measured.byteLength === 0) {
    return EMPTY_OUTBOUND_PAYLOAD
  }
  return Buffer.from(
    new Uint8Array(measured.buffer, measured.byteOffset, measured.byteLength)
  )
}

function getWebSocketBufferedAmount(websocket: VendoredWebSocket): number {
  const bufferedAmount = websocket.bufferedAmount
  return Number.isFinite(bufferedAmount) && bufferedAmount > 0
    ? bufferedAmount
    : 0
}

function isWebSocketOpen(websocket: VendoredWebSocket): boolean {
  return websocket.readyState === 1
}

function closeWebSocketForOutboundFailure(
  websocket: VendoredWebSocket,
  code: number,
  reason: string
): void {
  closeWebSocketAfterFailure(websocket, code, reason)
}

function handleOpenEvent(
  owned: WebSocketConnection,
  connection: ConnectionContext,
  options: WebSocketUpgradeTransportOptions
): void {
  if (
    options.registerPeer?.(
      owned.peer,
      owned.transportConnection,
      connection.transportContext
    ) === false
  ) {
    connection.closed = true
    return
  }

  connection.applicationHooksEnabled = true
  const hook = connection.metadata.hooks.open
  if (hook) {
    queueHook(owned, connection, () => hook(owned.peer), true)
  }
}

function handleMessageEvent(
  owned: WebSocketConnection,
  connection: ConnectionContext,
  message: WebSocketTransportMessage
): void {
  const hook = connection.metadata.hooks.message
  if (
    !hook ||
    !connection.applicationHooksEnabled ||
    connection.closed ||
    connection.hookFailed ||
    !isWebSocketOpen(owned.websocket)
  ) {
    return
  }

  const messageBytes = getMessageByteLength(message)
  if (
    connection.pendingMessages >= MAX_PENDING_MESSAGE_HOOKS ||
    connection.pendingMessageBytes + messageBytes > MAX_PENDING_MESSAGE_BYTES
  ) {
    connection.hookFailed = true
    closeWebSocketAfterFailure(
      owned.websocket,
      1008,
      'Too many pending messages'
    )
    return
  }

  connection.pendingMessages++
  connection.pendingMessageBytes += messageBytes
  pauseConnection(owned)
  connection.hookQueue = connection.hookQueue
    .then(() => {
      if (
        connection.closed ||
        connection.hookFailed ||
        !isWebSocketOpen(owned.websocket)
      ) {
        return
      }
      return invokeHook(
        owned,
        connection,
        () => hook(owned.peer, message),
        true
      )
    })
    .finally(() => {
      connection.pendingMessages--
      connection.pendingMessageBytes -= messageBytes
      if (
        connection.pendingMessages === 0 &&
        !connection.closed &&
        !connection.hookFailed &&
        isWebSocketOpen(owned.websocket)
      ) {
        resumeConnection(owned)
      }
    })
}

function handleCloseEvent(
  owned: WebSocketConnection,
  connection: ConnectionContext,
  details: { code: number; reason: string },
  options: WebSocketUpgradeTransportOptions
): void {
  if (connection.applicationHooksEnabled) {
    try {
      options.unregisterPeer?.(
        owned.peer,
        owned.transportConnection,
        connection.transportContext
      )
    } catch (error) {
      // Registry cleanup is a framework capability, but an embedding caller
      // may supply it. Preserve close-hook delivery and report a faulty
      // implementation through the same contained error channel as other
      // detached work.
      queueHook(
        owned,
        connection,
        () => {
          throw error
        },
        false
      )
    }
  }
  connection.closed = true
  const hook = connection.applicationHooksEnabled
    ? connection.metadata.hooks.close
    : undefined
  const pending = hook
    ? queueHook(owned, connection, () => hook(owned.peer, details), false)
    : connection.hookQueue
  connection.transportContext.trackTask?.(pending)
}

function handleErrorEvent(
  owned: WebSocketConnection,
  connection: ConnectionContext,
  error: Error
): void {
  // ws may have already selected a more precise protocol close code. Preserve
  // it when the transport is already CLOSING, otherwise make errors terminal.
  closeConnectionAfterFailure(owned, 'WebSocket transport failed')
  // A ws protocol error enters CLOSING before emitting `error` and can remain
  // there until its close timer expires if the client withholds a close reply.
  // Keep lifecycle ownership until the terminal `close` event so scope
  // shutdown can still find and terminate the live transport.
  connection.closed = true
  const hook = connection.applicationHooksEnabled
    ? connection.metadata.hooks.error
    : undefined
  const pending = hook
    ? queueHook(owned, connection, () => hook(owned.peer, error), true)
    : connection.hookQueue
  connection.transportContext.trackTask?.(pending)
}

function handlePingEvent(owned: WebSocketConnection, data: Buffer): void {
  if (!isWebSocketOpen(owned.websocket)) return

  const bufferedAmount = getWebSocketBufferedAmount(owned.websocket)
  if (bufferedAmount > MAX_OUTBOUND_BUFFER_BYTES - data.byteLength) {
    closeWebSocketForOutboundFailure(
      owned.websocket,
      1008,
      'WebSocket outbound buffer limit exceeded'
    )
    return
  }

  try {
    // Server control frames are unmasked. Socket write failures are owned by
    // ws's close path, so a second callback error channel would double-report.
    owned.websocket.pong(data)
  } catch {
    closeConnectionAfterFailure(owned, 'WebSocket transport failed')
  }
}

function normalizeIncomingData(data: unknown): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data)
  if (Buffer.isBuffer(data)) return data
  if (types.isArrayBuffer(data)) return Buffer.from(data)
  throw new TypeError('Unexpected WebSocket message data from the transport.')
}

function isolateIncomingBinaryData(data: Buffer): Uint8Array {
  const isolated = new Uint8Array(data.byteLength)
  typedArraySet.call(isolated, data)
  return isolated
}

function createTransportConnection(
  websocket: VendoredWebSocket
): WebSocketTransportConnection {
  const close = websocket.close.bind(websocket)
  const terminate = websocket.terminate.bind(websocket)
  const once = websocket.once.bind(websocket)
  const off = websocket.off.bind(websocket)

  return Object.freeze({
    getReadyState: () => websocket.readyState,
    onClose(listener: () => void) {
      once('close', listener)
      return () => off('close', listener)
    },
    close(code?: number) {
      closeAndResumeWebSocket(websocket, () => close(code))
    },
    terminate,
  })
}

function attachConnection(
  websocket: VendoredWebSocket,
  pending: PendingUpgrade,
  options: WebSocketUpgradeTransportOptions
): void {
  const { connection, request, socket } = pending
  const peer = new NextWebSocketPeer(websocket, request, socket)
  const owned: WebSocketConnection = {
    peer,
    websocket,
    transportConnection: createTransportConnection(websocket),
  }
  // Keep transport output in the one synchronous Node representation this
  // transport owns. The raw transport is never exposed to application hooks.
  websocket.binaryType = 'nodebuffer'

  // Error must be owned before any other operation can emit it. All transport
  // listeners precede registration because registration can reject and close
  // the peer synchronously.
  websocket.on('error', (error) => handleErrorEvent(owned, connection, error))
  websocket.on('close', (code, reason) =>
    handleCloseEvent(
      owned,
      connection,
      { code, reason: reason.toString('utf8') },
      options
    )
  )
  websocket.on('message', (data, isBinary) => {
    try {
      const raw = normalizeIncomingData(data)
      handleMessageEvent(
        owned,
        connection,
        new NextWebSocketMessage(
          isBinary ? isolateIncomingBinaryData(raw) : raw.toString('utf8')
        )
      )
    } catch (error) {
      handleErrorEvent(
        owned,
        connection,
        error instanceof Error ? error : new Error(String(error))
      )
    }
  })
  websocket.on('ping', (data) => handlePingEvent(owned, data))
  handleOpenEvent(owned, connection, options)
}

/**
 * Creates the Next-owned ws transport for one generated App Route module.
 */
export function createWebSocketUpgradeTransport(
  options: WebSocketUpgradeTransportOptions = {}
): WebSocketUpgradeTransport {
  const { WebSocketServer } = loadWebSocketTransportDependencies()
  const pendingUpgrades = new WeakMap<IncomingMessage, PendingUpgrade>()
  const wss = new WebSocketServer({
    noServer: true,
    clientTracking: false,
    // Pace coalesced frames one event per macrotask. This prevents same-stack
    // multi-dispatch, while the count/byte limits remain the admission policy.
    allowSynchronousEvents: false,
    // Native automatic pongs bypass Next's outbound buffer policy.
    autoPong: false,
    handleProtocols: (protocols, request) => {
      const selected = pendingUpgrades.get(request)?.protocol
      return selected && protocols.has(selected) ? selected : false
    },
    maxPayload: MAX_PAYLOAD,
    perMessageDeflate: false,
    maxFragments: MAX_FRAGMENTS,
    maxBufferedChunks: MAX_BUFFERED_CHUNKS,
    closeTimeout: WS_CLOSE_TIMEOUT_MS,
  } as VendoredWebSocketServerOptions)

  // A listener prevents ws from writing its own raw HTTP rejection. Next
  // pre-validates a stricter handshake and owns every fallback response.
  wss.on('wsClientError', (error: Error) => {
    throw error
  })
  wss.on('headers', (headers, request) => {
    const pending = pendingUpgrades.get(request)
    if (!pending) {
      throw new Error(
        'Invariant: WebSocket upgrade is missing its transport state.'
      )
    }
    headers.push(...pending.headerLines)
    markRawHttpResponseCommitted(pending.socket, 101)
  })
  wss.on('connection', (websocket, request) => {
    const pending = pendingUpgrades.get(request)
    if (!pending) {
      throw new Error(
        'Invariant: WebSocket connection is missing its transport state.'
      )
    }
    attachConnection(websocket as VendoredWebSocket, pending, options)
  })

  return {
    async handleUpgrade(req, socket, head, request, response, context = {}) {
      const metadata = getWebSocketUpgradeMetadata(response) as
        | WebSocketTransportUpgradeMetadata
        | undefined
      if (!metadata) {
        throw new Error(
          'Invariant: WebSocket transport received a non-upgrade response.'
        )
      }

      const handshakeError = validateWebSocketHandshake(req)
      if (handshakeError) {
        await writeRawHttpError(
          req,
          socket,
          handshakeError.status,
          handshakeError.message,
          handshakeError.headers
        )
        return {
          statusCode: handshakeError.status,
          upgraded: false,
        }
      }

      const policyError = validateWebSocketRequestPolicy(req, metadata)
      if (policyError) {
        await writeRawHttpError(
          req,
          socket,
          policyError.status,
          policyError.message,
          policyError.headers
        )
        return {
          statusCode: policyError.status,
          upgraded: false,
        }
      }

      const pending: PendingUpgrade = {
        socket,
        protocol: metadata.protocol,
        headerLines: getUpgradeResponseHeaderLines(response),
        request,
        connection: {
          metadata,
          transportContext: context,
          hookQueue: Promise.resolve(),
          pendingMessages: 0,
          pendingMessageBytes: 0,
          closed: false,
          hookFailed: false,
          applicationHooksEnabled: false,
        },
      }
      pendingUpgrades.set(req, pending)

      let callbackInvoked = false
      try {
        wss.handleUpgrade(
          req,
          socket as import('node:net').Socket,
          head,
          (websocket) => {
            callbackInvoked = true
            wss.emit('connection', websocket, req)
          }
        )
      } catch (error) {
        if (getRawHttpResponseStatus(socket) !== undefined) {
          socket.destroy()
        }
        throw error
      } finally {
        pendingUpgrades.delete(req)
      }

      if (!callbackInvoked || getRawHttpResponseStatus(socket) !== 101) {
        throw createWebSocketClientDisconnectError(
          'WebSocket upgrade client disconnected.'
        )
      }
      return { statusCode: 101, upgraded: true }
    },
  }
}
