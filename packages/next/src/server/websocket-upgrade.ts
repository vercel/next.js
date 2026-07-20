import type { IncomingMessage } from 'node:http'
import { STATUS_CODES } from 'node:http'
import type { Duplex } from 'node:stream'

import type {
  WebSocketMessage,
  WebSocketPeer,
  WebSocketUpgradeMetadata,
} from './web/spec-extension/response'
import { getWebSocketUpgradeMetadata } from './web/spec-extension/response'
import { filterInternalHeaders } from './lib/server-ipc/utils'
import { splitCookiesString } from './web/utils'

type CrossWSNodeAdapterFactory =
  (typeof import('next/dist/compiled/crossws/adapters/node'))['default']
type WebSocketServerConstructor =
  (typeof import('next/dist/compiled/ws'))['Server']
type CrossWSNodeAdapter = ReturnType<CrossWSNodeAdapterFactory>

let createCrossWSNodeAdapter: CrossWSNodeAdapterFactory | undefined
let WebSocketServer: WebSocketServerConstructor | undefined
if (process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS) {
  createCrossWSNodeAdapter = (
    require('next/dist/compiled/crossws/adapters/node') as typeof import('next/dist/compiled/crossws/adapters/node')
  ).default
  WebSocketServer = (
    require('next/dist/compiled/ws') as typeof import('next/dist/compiled/ws')
  ).Server
} else {
  createCrossWSNodeAdapter = undefined
  WebSocketServer = undefined
}

const FORBIDDEN_UPGRADE_HEADERS = new Set([
  'connection',
  'content-length',
  'sec-websocket-accept',
  'sec-websocket-extensions',
  'sec-websocket-protocol',
  'transfer-encoding',
  'upgrade',
])
const WEBSOCKET_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const MAX_PAYLOAD = 16 * 1024 * 1024
const MAX_FRAGMENTS = 1024
const MAX_BUFFERED_CHUNKS = 1024
const MAX_PENDING_MESSAGE_HOOKS = 32
const CONNECTION_CONTEXT = Symbol('next.websocket.connection-context')
const SELECTED_PROTOCOL = Symbol('next.websocket.selected-protocol')
const UPGRADE_COMMITTED = Symbol('next.websocket.upgrade-committed')

export interface WebSocketUpgradeTransportContext {
  onHookError?: (error: unknown) => void | Promise<void>
  registryScope?: symbol
}

export interface WebSocketUpgradeTransportOptions {
  registerPeer?: (
    peer: WebSocketPeer,
    context: WebSocketUpgradeTransportContext
  ) => void
  unregisterPeer?: (
    peer: WebSocketPeer,
    context: WebSocketUpgradeTransportContext
  ) => void
}

export interface WebSocketUpgradeTransport {
  handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    request: Request,
    response: Response,
    context?: WebSocketUpgradeTransportContext
  ): Promise<boolean>
}

interface ConnectionContext {
  metadata: WebSocketUpgradeMetadata
  response: Response
  transportContext: WebSocketUpgradeTransportContext
  hookQueue: Promise<void>
  pendingMessages: number
  closed: boolean
  hookFailed: boolean
}

function validateHeaderPart(value: string, name: string): void {
  if (/\r|\n/.test(value)) {
    throw new TypeError(`Invalid ${name} in WebSocket upgrade response.`)
  }
}

async function writeSocket(socket: Duplex, chunk: Uint8Array | string) {
  if (socket.destroyed || socket.writableEnded) {
    throw new Error('WebSocket upgrade client disconnected.')
  }

  if (socket.write(chunk)) return

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.off('drain', onDrain)
      socket.off('close', onClose)
      socket.off('error', onError)
    }
    const onDrain = () => {
      cleanup()
      resolve()
    }
    const onClose = () => {
      cleanup()
      reject(new Error('WebSocket upgrade client disconnected.'))
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    socket.once('drain', onDrain)
    socket.once('close', onClose)
    socket.once('error', onError)
  })
}

function getResponseHeaderLines(headers: Headers): string[] {
  const lines: string[] = []

  headers.forEach((value, name) => {
    const lowerName = name.toLowerCase()
    if (lowerName === 'x-middleware-set-cookie') return

    validateHeaderPart(name, 'header name')
    if (lowerName === 'set-cookie') {
      for (const cookie of splitCookiesString(value)) {
        validateHeaderPart(cookie, 'header value')
        lines.push(`${name}: ${cookie}`)
      }
    } else {
      validateHeaderPart(value, 'header value')
      lines.push(`${name}: ${value}`)
    }
  })

  return lines
}

export function getUpgradeResponseHeaders(response: Response): Headers {
  const headers = new Headers(response.headers)
  headers.delete('x-middleware-set-cookie')
  return headers
}

/**
 * Writes an ordinary Response directly to a socket received from Node's
 * `upgrade` event. Node never creates a ServerResponse for these requests.
 */
export async function writeRawHttpResponse(
  req: IncomingMessage,
  socket: Duplex,
  response: Response
): Promise<void> {
  const bodyAllowed =
    req.method !== 'HEAD' &&
    response.body !== null &&
    response.status !== 204 &&
    response.status !== 304
  const responseHeaders = new Headers(response.headers)
  // The framework owns framing on this raw socket. Forwarding an application
  // supplied length or transfer coding could create an ambiguous response for
  // an intermediary which attempted the upgrade.
  responseHeaders.delete('connection')
  responseHeaders.delete('content-length')
  responseHeaders.delete('transfer-encoding')
  const headerLines = getResponseHeaderLines(responseHeaders)
  headerLines.push('Connection: close')

  const chunked = bodyAllowed && req.httpVersion !== '1.0'
  if (chunked) {
    headerLines.push('Transfer-Encoding: chunked')
  } else if (!bodyAllowed) {
    headerLines.push('Content-Length: 0')
  }

  const statusText = response.statusText || STATUS_CODES[response.status] || ''
  validateHeaderPart(statusText, 'status text')
  await writeSocket(
    socket,
    `HTTP/1.1 ${response.status} ${statusText}\r\n${headerLines.join(
      '\r\n'
    )}\r\n\r\n`
  )

  if (bodyAllowed) {
    const reader = response.body!.getReader()
    const onClose = () => {
      void reader.cancel('WebSocket upgrade client disconnected.')
    }
    socket.once('close', onClose)

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value.byteLength) continue

        if (chunked) {
          await writeSocket(socket, `${value.byteLength.toString(16)}\r\n`)
          await writeSocket(socket, value)
          await writeSocket(socket, '\r\n')
        } else {
          await writeSocket(socket, value)
        }
      }

      if (chunked) {
        await writeSocket(socket, '0\r\n\r\n')
      }
    } finally {
      socket.off('close', onClose)
      reader.releaseLock()
    }
  }

  if (!socket.destroyed && !socket.writableEnded) {
    socket.end()
  }
}

export function writeRawHttpError(
  req: IncomingMessage,
  socket: Duplex,
  status: number,
  message: string,
  headers?: HeadersInit
): Promise<void> {
  const responseHeaders = new Headers(headers)
  if (!responseHeaders.has('content-type')) {
    responseHeaders.set('content-type', 'text/plain; charset=utf-8')
  }

  return writeRawHttpResponse(
    req,
    socket,
    new Response(message, {
      status,
      headers: responseHeaders,
    })
  )
}

export interface WebSocketHandshakeError {
  status: number
  message: string
  headers?: HeadersInit
}

/**
 * Strips headers which are meaningful only between trusted Next.js processes.
 */
export function filterWebSocketUpgradeRequestHeaders(
  req: IncomingMessage
): void {
  if (!process.env.NEXT_PRIVATE_TEST_HEADERS) {
    filterInternalHeaders(req.headers)
  }
}

/**
 * Validates protocol fields which must be safe before user code executes.
 */
export function validateWebSocketHandshake(
  req: IncomingMessage
): WebSocketHandshakeError | undefined {
  if (req.method !== 'GET') {
    return {
      status: 405,
      message: 'WebSocket upgrades require GET.',
      headers: { allow: 'GET' },
    }
  }
  if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
    return { status: 400, message: 'Invalid WebSocket Upgrade header.' }
  }
  const connection = req.headers.connection
  if (
    !connection
      ?.split(',')
      .some((value) => value.trim().toLowerCase() === 'upgrade')
  ) {
    return { status: 400, message: 'Invalid WebSocket Connection header.' }
  }
  if (req.headers['sec-websocket-version'] !== '13') {
    return {
      status: 426,
      message: 'Unsupported WebSocket version.',
      headers: { 'sec-websocket-version': '13' },
    }
  }

  const host = req.headers.host
  if (typeof host !== 'string' || !host) {
    return { status: 400, message: 'Invalid WebSocket Host header.' }
  }

  const key = req.headers['sec-websocket-key']
  if (
    typeof key !== 'string' ||
    !/^[+/0-9A-Za-z]{22}==$/.test(key) ||
    Buffer.from(key, 'base64').byteLength !== 16
  ) {
    return { status: 400, message: 'Invalid Sec-WebSocket-Key header.' }
  }

  const protocolHeader = req.headers['sec-websocket-protocol']
  if (protocolHeader) {
    const protocols = Array.isArray(protocolHeader)
      ? protocolHeader.join(',').split(',')
      : protocolHeader.split(',')
    const seen = new Set<string>()
    for (const item of protocols) {
      const protocol = item.trim()
      if (!WEBSOCKET_TOKEN.test(protocol) || seen.has(protocol)) {
        return {
          status: 400,
          message: 'Invalid Sec-WebSocket-Protocol header.',
        }
      }
      seen.add(protocol)
    }
  }

  return undefined
}

function getRequestedProtocols(req: IncomingMessage): Set<string> {
  const protocolHeader = req.headers['sec-websocket-protocol']
  if (!protocolHeader) return new Set()

  return new Set(
    (Array.isArray(protocolHeader) ? protocolHeader.join(',') : protocolHeader)
      .split(',')
      .map((protocol) => protocol.trim())
  )
}

/**
 * Enforces browser-origin isolation and server-controlled protocol selection.
 */
export function validateWebSocketRequestPolicy(
  req: IncomingMessage,
  metadata: WebSocketUpgradeMetadata
): WebSocketHandshakeError | undefined {
  const originHeader = req.headers.origin
  if (originHeader !== undefined) {
    if (typeof originHeader !== 'string') {
      return { status: 403, message: 'WebSocket origin is not allowed.' }
    }

    let origin: URL
    try {
      origin = new URL(originHeader)
    } catch {
      return { status: 403, message: 'WebSocket origin is not allowed.' }
    }

    if (
      (origin.protocol !== 'http:' && origin.protocol !== 'https:') ||
      origin.origin !== originHeader
    ) {
      return { status: 403, message: 'WebSocket origin is not allowed.' }
    }

    let requestHost: string
    try {
      requestHost = new URL(`http://${req.headers.host}`).host
    } catch {
      return { status: 400, message: 'Invalid WebSocket Host header.' }
    }

    const sameHost = origin.host === requestHost
    const explicitlyAllowed = metadata.allowedOrigins?.includes(origin.origin)
    if (!sameHost && !explicitlyAllowed) {
      return { status: 403, message: 'WebSocket origin is not allowed.' }
    }
  }

  if (metadata.protocol && !getRequestedProtocols(req).has(metadata.protocol)) {
    return {
      status: 400,
      message: 'Selected WebSocket subprotocol was not offered by the client.',
    }
  }

  return undefined
}

export function validateUpgradeResponseHeaders(response: Response): void {
  for (const name of response.headers.keys()) {
    if (FORBIDDEN_UPGRADE_HEADERS.has(name.toLowerCase())) {
      throw new TypeError(
        `NextResponse.upgrade() cannot set the protocol-critical "${name}" header.`
      )
    }
  }
}

function getConnectionContext(
  peer: WebSocketPeer
): ConnectionContext | undefined {
  return (
    peer.context as typeof peer.context & {
      [CONNECTION_CONTEXT]?: ConnectionContext
    }
  )[CONNECTION_CONTEXT]
}

function reportHookError(connection: ConnectionContext, error: unknown): void {
  try {
    Promise.resolve(connection.transportContext.onHookError?.(error)).catch(
      (reportError) => {
        console.error('Failed to report WebSocket hook error', reportError)
      }
    )
  } catch (reportError) {
    console.error('Failed to report WebSocket hook error', reportError)
  }
}

function closePeerAfterHookError(peer: WebSocketPeer): void {
  const readyState = peer.websocket.readyState
  if (readyState === 2 || readyState === 3) return

  try {
    peer.close(1011, 'WebSocket handler failed')
  } catch {
    try {
      peer.terminate()
    } catch {}
  }
}

async function invokeHook(
  peer: WebSocketPeer,
  connection: ConnectionContext,
  invoke: () => void | Promise<void>,
  closeOnError: boolean
): Promise<void> {
  try {
    await invoke()
  } catch (error) {
    reportHookError(connection, error)
    if (closeOnError) {
      connection.hookFailed = true
      closePeerAfterHookError(peer)
    }
  }
}

function queueHook(
  peer: WebSocketPeer,
  connection: ConnectionContext,
  invoke: () => void | Promise<void>,
  closeOnError: boolean
): void {
  connection.hookQueue = connection.hookQueue.then(() =>
    invokeHook(peer, connection, invoke, closeOnError)
  )
}

function cleanupEmptyNamespace(
  adapter: CrossWSNodeAdapter,
  peer: WebSocketPeer
): void {
  const peers = adapter.peers.get(peer.namespace)
  if (peers?.size === 0) {
    adapter.peers.delete(peer.namespace)
  }
}

function pausePeer(peer: WebSocketPeer): void {
  try {
    ;(
      peer.websocket as typeof peer.websocket & { pause?: () => void }
    ).pause?.()
  } catch {}
}

function resumePeer(peer: WebSocketPeer): void {
  try {
    ;(
      peer.websocket as typeof peer.websocket & { resume?: () => void }
    ).resume?.()
  } catch {}
}

/**
 * Creates the shared CrossWS Node adapter for one generated App Route module.
 */
export function createWebSocketUpgradeTransport(
  options: WebSocketUpgradeTransportOptions = {}
): WebSocketUpgradeTransport {
  if (!createCrossWSNodeAdapter || !WebSocketServer) {
    throw new Error(
      'WebSocket Route Handlers are unavailable because experimental.webSocketRouteHandlers is not enabled.'
    )
  }

  const pendingRequests = new WeakMap<Request, ConnectionContext>()
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols, request) => {
      const selected = (
        request as IncomingMessage & { [SELECTED_PROTOCOL]?: string }
      )[SELECTED_PROTOCOL]
      return selected && protocols.has(selected) ? selected : false
    },
    maxPayload: MAX_PAYLOAD,
    perMessageDeflate: false,
    maxFragments: MAX_FRAGMENTS,
    maxBufferedChunks: MAX_BUFFERED_CHUNKS,
  } as import('next/dist/compiled/ws').ServerOptions & {
    maxFragments: number
    maxBufferedChunks: number
  })
  wss.on('headers', (_headers, request) => {
    ;(request as IncomingMessage & { [UPGRADE_COMMITTED]?: boolean })[
      UPGRADE_COMMITTED
    ] = true
  })
  let adapter: CrossWSNodeAdapter
  adapter = createCrossWSNodeAdapter({
    // CrossWS bundles its own copy of `ws`. Supplying Next.js's vetted copy
    // keeps the network-facing parser on the version pinned by Next.js.
    wss: wss as unknown as NonNullable<
      Parameters<CrossWSNodeAdapterFactory>[0]
    >['wss'],
    hooks: {
      upgrade(request) {
        const connection = pendingRequests.get(request)
        if (!connection) {
          throw new Error(
            'Invariant: CrossWS upgrade request is missing its App Route response.'
          )
        }

        return {
          headers: getUpgradeResponseHeaders(connection.response),
          context: {
            [CONNECTION_CONTEXT]: connection,
          } as unknown as Record<string, unknown>,
        }
      },
      open(peer) {
        const connection = getConnectionContext(peer)
        if (!connection) return

        options.registerPeer?.(peer, connection.transportContext)
        const hook = connection.metadata.hooks.open
        if (hook) queueHook(peer, connection, () => hook(peer), true)
      },
      message(peer, message: WebSocketMessage) {
        const connection = getConnectionContext(peer)
        const hook = connection?.metadata.hooks.message
        if (
          !connection ||
          !hook ||
          connection.closed ||
          connection.hookFailed
        ) {
          return
        }

        if (connection.pendingMessages >= MAX_PENDING_MESSAGE_HOOKS) {
          connection.hookFailed = true
          try {
            peer.close(1008, 'Too many pending messages')
          } catch {
            try {
              peer.terminate()
            } catch {}
          }
          return
        }

        connection.pendingMessages++
        pausePeer(peer)
        connection.hookQueue = connection.hookQueue
          .then(() => {
            if (connection.closed || connection.hookFailed) return
            return invokeHook(peer, connection, () => hook(peer, message), true)
          })
          .finally(() => {
            connection.pendingMessages--
            if (
              connection.pendingMessages === 0 &&
              !connection.closed &&
              !connection.hookFailed
            ) {
              resumePeer(peer)
            }
          })
      },
      close(peer, details) {
        const connection = getConnectionContext(peer)
        if (connection) {
          options.unregisterPeer?.(peer, connection.transportContext)
        }
        cleanupEmptyNamespace(adapter, peer)
        if (connection) connection.closed = true
        const hook = connection?.metadata.hooks.close
        if (connection && hook) {
          queueHook(peer, connection, () => hook(peer, details), false)
        }
      },
      error(peer, error) {
        const connection = getConnectionContext(peer)
        if (connection) {
          options.unregisterPeer?.(peer, connection.transportContext)
        }
        cleanupEmptyNamespace(adapter, peer)
        const hook = connection?.metadata.hooks.error
        if (connection && hook) {
          queueHook(peer, connection, () => hook(peer, error), true)
        }
      },
    },
  })

  return {
    async handleUpgrade(req, socket, head, request, response, context = {}) {
      const metadata = getWebSocketUpgradeMetadata(response)
      if (!metadata) return false

      const handshakeError = validateWebSocketHandshake(req)
      if (handshakeError) {
        await writeRawHttpError(
          req,
          socket,
          handshakeError.status,
          handshakeError.message,
          handshakeError.headers
        )
        return true
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
        return true
      }

      validateUpgradeResponseHeaders(response)
      pendingRequests.set(request, {
        metadata,
        response,
        transportContext: context,
        hookQueue: Promise.resolve(),
        pendingMessages: 0,
        closed: false,
        hookFailed: false,
      })

      try {
        ;(req as IncomingMessage & { [SELECTED_PROTOCOL]?: string })[
          SELECTED_PROTOCOL
        ] = metadata.protocol
        await adapter.handleUpgrade(req, socket, head, request)
      } catch (error) {
        if (
          (req as IncomingMessage & { [UPGRADE_COMMITTED]?: boolean })[
            UPGRADE_COMMITTED
          ]
        ) {
          socket.destroy()
        }
        throw error
      } finally {
        delete (req as IncomingMessage & { [SELECTED_PROTOCOL]?: string })[
          SELECTED_PROTOCOL
        ]
        pendingRequests.delete(request)
      }

      return true
    },
  }
}
