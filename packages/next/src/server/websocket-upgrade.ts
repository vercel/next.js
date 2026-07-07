import type { IncomingMessage } from 'node:http'
import { STATUS_CODES } from 'node:http'
import type { Duplex } from 'node:stream'

import type {
  WebSocketMessage,
  WebSocketPeer,
  WebSocketUpgradeMetadata,
} from './web/spec-extension/response'
import { getWebSocketUpgradeMetadata } from './web/spec-extension/response'
import { splitCookiesString } from './web/utils'

type CrossWSNodeAdapterFactory =
  (typeof import('next/dist/compiled/crossws/adapters/node'))['default']

let createCrossWSNodeAdapter: CrossWSNodeAdapterFactory | undefined
if (process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS) {
  createCrossWSNodeAdapter = (
    require('next/dist/compiled/crossws/adapters/node') as typeof import('next/dist/compiled/crossws/adapters/node')
  ).default
} else {
  createCrossWSNodeAdapter = undefined
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
const CONNECTION_CONTEXT = Symbol('next.websocket.connection-context')

export interface WebSocketUpgradeTransportContext {
  onHookError?: (error: unknown) => void | Promise<void>
}

export interface WebSocketUpgradeTransportOptions {
  registerPeer?: (peer: WebSocketPeer) => void
  unregisterPeer?: (peer: WebSocketPeer) => void
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

function getResponseHeaderLines(response: Response): string[] {
  const lines: string[] = []

  response.headers.forEach((value, name) => {
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
  const headerLines = getResponseHeaderLines(response)
  const hasContentLength = response.headers.has('content-length')
  const transferEncoding = response.headers.get('transfer-encoding')
  const hasTransferEncoding = transferEncoding !== null

  if (!response.headers.has('connection')) {
    headerLines.push('Connection: close')
  }

  const chunked =
    bodyAllowed &&
    !hasContentLength &&
    (!transferEncoding ||
      transferEncoding
        .split(',')
        .some((encoding) => encoding.trim().toLowerCase() === 'chunked'))
  if (chunked && !hasTransferEncoding) {
    headerLines.push('Transfer-Encoding: chunked')
  } else if (!bodyAllowed && !hasContentLength && !hasTransferEncoding) {
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
  message: string
): Promise<void> {
  return writeRawHttpResponse(
    req,
    socket,
    new Response(message, {
      status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  )
}

function validateHandshake(req: IncomingMessage): string | undefined {
  if (req.method !== 'GET') return 'WebSocket upgrades require GET.'
  if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
    return 'Invalid WebSocket Upgrade header.'
  }
  const connection = req.headers.connection
  if (
    !connection
      ?.split(',')
      .some((value) => value.trim().toLowerCase() === 'upgrade')
  ) {
    return 'Invalid WebSocket Connection header.'
  }
  if (req.headers['sec-websocket-version'] !== '13') {
    return 'Unsupported WebSocket version.'
  }

  const key = req.headers['sec-websocket-key']
  if (
    typeof key !== 'string' ||
    !/^[+/0-9A-Za-z]{22}==$/.test(key) ||
    Buffer.from(key, 'base64').byteLength !== 16
  ) {
    return 'Invalid Sec-WebSocket-Key header.'
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
        return 'Invalid Sec-WebSocket-Protocol header.'
      }
      seen.add(protocol)
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

function observeHook(
  peer: WebSocketPeer,
  connection: ConnectionContext,
  invoke: () => void | Promise<void>,
  closeOnError: boolean
): void {
  const handleError = (error: unknown) => {
    reportHookError(connection, error)
    if (closeOnError) closePeerAfterHookError(peer)
  }

  let result: void | Promise<void>
  try {
    result = invoke()
  } catch (error) {
    handleError(error)
    return
  }

  if (result && typeof result.then === 'function') {
    try {
      void result.catch(handleError)
    } catch (error) {
      handleError(error)
    }
  }
}

/**
 * Creates the shared CrossWS Node adapter for one generated App Route module.
 */
export function createWebSocketUpgradeTransport(
  options: WebSocketUpgradeTransportOptions = {}
): WebSocketUpgradeTransport {
  if (!createCrossWSNodeAdapter) {
    throw new Error(
      'WebSocket Route Handlers are unavailable because experimental.webSocketRouteHandlers is not enabled.'
    )
  }

  const pendingRequests = new WeakMap<Request, ConnectionContext>()
  const adapter = createCrossWSNodeAdapter({
    serverOptions: {
      maxPayload: MAX_PAYLOAD,
      perMessageDeflate: false,
    },
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

        options.registerPeer?.(peer)
        const hook = connection.metadata.hooks.open
        if (hook) observeHook(peer, connection, () => hook(peer), true)
      },
      message(peer, message: WebSocketMessage) {
        const connection = getConnectionContext(peer)
        const hook = connection?.metadata.hooks.message
        if (connection && hook) {
          observeHook(peer, connection, () => hook(peer, message), true)
        }
      },
      close(peer, details) {
        options.unregisterPeer?.(peer)
        const connection = getConnectionContext(peer)
        const hook = connection?.metadata.hooks.close
        if (connection && hook) {
          observeHook(peer, connection, () => hook(peer, details), false)
        }
      },
      error(peer, error) {
        const connection = getConnectionContext(peer)
        const hook = connection?.metadata.hooks.error
        if (connection && hook) {
          observeHook(peer, connection, () => hook(peer, error), true)
        }
      },
    },
  })

  return {
    async handleUpgrade(req, socket, head, request, response, context = {}) {
      const metadata = getWebSocketUpgradeMetadata(response)
      if (!metadata) return false

      const handshakeError = validateHandshake(req)
      if (handshakeError) {
        await writeRawHttpError(req, socket, 400, handshakeError)
        return true
      }

      validateUpgradeResponseHeaders(response)
      pendingRequests.set(request, {
        metadata,
        response,
        transportContext: context,
      })

      try {
        await adapter.handleUpgrade(req, socket, head, request)
      } finally {
        pendingRequests.delete(request)
      }

      return true
    },
  }
}
