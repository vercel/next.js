import type { IncomingMessage } from 'node:http'
import {
  STATUS_CODES,
  validateHeaderName,
  validateHeaderValue,
} from 'node:http'
import type { Duplex } from 'node:stream'
import { types as nodeUtilTypes } from 'node:util'

import {
  filterInternalHeaders,
  filterInternalRawHeaders,
  isInternalHeader,
} from './lib/server-ipc/utils'
import type { WebSocketUpgradeMetadata } from './web/spec-extension/websocket-upgrade-response'
import {
  getConnectionHeaderTokens,
  HTTP_TOKEN as WEBSOCKET_TOKEN,
} from './web/spec-extension/websocket-connection-headers'
import { splitCookiesString } from './web/utils'
import { isExactWebSocketOrigin } from './websocket-origin'

const WEBSOCKET_UPGRADE_HEADERS_FILTERED = Symbol.for(
  'next.websocket.upgrade-headers-filtered'
)

// Fields whose hop-by-hop or framing semantics the framework owns whenever it
// serializes a raw response on an upgrade socket.
const RAW_RESPONSE_FRAMING_HEADERS = [
  'connection',
  'content-length',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
] as const

const FORBIDDEN_UPGRADE_HEADERS = new Set([
  ...RAW_RESPONSE_FRAMING_HEADERS,
  'sec-websocket-accept',
  'sec-websocket-extensions',
  'sec-websocket-key',
  'sec-websocket-protocol',
  'sec-websocket-version',
])
const UPGRADE_RESPONSE_HEADER_VALUE = /^[\t\x20-\x7e]*$/
const RAW_HTTP_RESPONSE_COMMITTED = Symbol.for(
  'next.websocket.raw-http-response-committed'
)
const RAW_UPGRADE_ERROR_OWNER = Symbol.for(
  'next.websocket.raw-upgrade-error-owner'
)
const RAW_HTTP_ERROR_CACHE_CONTROL =
  'private, no-cache, no-store, max-age=0, must-revalidate'
const RAW_HTTP_ERROR_FORBIDDEN_HEADERS = new Set([
  'age',
  'content-encoding',
  'edge-control',
  'etag',
  'expires',
  'last-modified',
  'surrogate-control',
  'x-lighttpd-send-file',
  'x-sendfile',
])
const rawSocketIoErrors = new WeakSet<Error>()
type ParseWebSocketExtensions = (value: string) => unknown
let parseWebSocketExtensions: ParseWebSocketExtensions | undefined

function getWebSocketExtensionParser(): ParseWebSocketExtensions {
  if (parseWebSocketExtensions) return parseWebSocketExtensions

  const WebSocket =
    require('next/dist/compiled/ws') as typeof import('next/dist/compiled/ws')
  const extension = (
    WebSocket as typeof WebSocket & {
      extension?: { parse?: unknown }
    }
  ).extension
  if (typeof extension?.parse !== 'function') {
    throw new Error('The vendored WebSocket extension parser is unavailable.')
  }
  return (parseWebSocketExtensions =
    extension.parse as ParseWebSocketExtensions)
}

export function createWebSocketClientDisconnectError(message: string): Error {
  const error = new Error(message)
  rawSocketIoErrors.add(error)
  return error
}

function markRawSocketIoError(error: unknown): unknown {
  if (error instanceof Error) {
    rawSocketIoErrors.add(error)
  }
  return error
}

export function isWebSocketClientDisconnectError(error: unknown): boolean {
  try {
    return error instanceof Error && rawSocketIoErrors.has(error)
  } catch {
    return false
  }
}

function isRawHttpErrorForbiddenHeader(name: string): boolean {
  const lowerName = name.toLowerCase()
  return (
    RAW_HTTP_ERROR_FORBIDDEN_HEADERS.has(lowerName) ||
    lowerName.endsWith('-cache-control') ||
    lowerName.startsWith('x-accel-')
  )
}

function getRawHeaderValues(
  req: IncomingMessage,
  headerName: string
): string[] {
  const rawHeaders = req.rawHeaders
  if (Array.isArray(rawHeaders) && rawHeaders.length > 0) {
    const values: string[] = []
    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index]?.toLowerCase() === headerName) {
        values.push(rawHeaders[index + 1] || '')
      }
    }
    return values
  }

  // IncomingMessage always has rawHeaders. This fallback keeps validation
  // useful for framework-provided request doubles without weakening real Node
  // requests, where duplicate fields remain visible above.
  const value = req.headers[headerName]
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function hasRequestHeader(req: IncomingMessage, headerName: string): boolean {
  return getRawHeaderValues(req, headerName).length > 0
}

/** Classifies an Upgrade request without claiming other protocols. */
export function isWebSocketUpgradeRequest(req: IncomingMessage): boolean {
  return getRawHeaderValues(req, 'upgrade').some((value) =>
    value
      .split(',')
      .some((protocol) => protocol.trim().toLowerCase() === 'websocket')
  )
}

function getWebSocketRequestAuthority(req: IncomingMessage): URL | undefined {
  const hostValues = getRawHeaderValues(req, 'host')
  if (hostValues.length !== 1) return undefined
  const host = hostValues[0]
  if (!host || /\s|[\\/@?#,]/.test(host)) {
    return undefined
  }

  try {
    const protocol = (req.socket as { encrypted?: boolean } | undefined)
      ?.encrypted
      ? 'https:'
      : 'http:'
    const authority = new URL(`${protocol}//${host}`)
    return isExactWebSocketOrigin(authority.origin) ? authority : undefined
  } catch {
    return undefined
  }
}

function validateResponseHeader(name: string, value: string): void {
  validateHeaderName(name)
  validateHeaderValue(name, value)
}

function isSocketDisconnected(socket: Duplex): boolean {
  return socket.destroyed || socket.writableEnded || socket.readableEnded
}

function isSocketWriteClosed(socket: Duplex): boolean {
  return (
    socket.destroyed ||
    socket.closed ||
    socket.writableEnded ||
    !socket.writable
  )
}

interface OwnedListenerTarget {
  on(event: string, listener: (...args: any[]) => void): unknown
  off(event: string, listener: (...args: any[]) => void): unknown
}

/** @internal One listener installed and owned through `createOwnedListeners`. */
export interface OwnedListenerEntry {
  target: OwnedListenerTarget
  event: string
  listener: (...args: any[]) => void
}

/**
 * Combines listener-bookkeeping failures into one error value: the sole
 * failure itself, or an AggregateError caused by the first one.
 *
 * @internal
 */
export function combineListenerFailures(
  failures: unknown[],
  message: string
): unknown {
  if (failures.length === 1) return failures[0]
  return new AggregateError(failures, message, { cause: failures[0] })
}

/**
 * Owns the listeners one bookkeeping site installs on potentially hostile
 * EventEmitters. Every listener is recorded as owned before `on` runs, so a
 * `newListener` hook which inserts the listener and then throws can never
 * leave an installed listener untracked, and removal collects throwing
 * `removeListener` hooks as failures instead of propagating them.
 *
 * Only bookkeeping lives here. Each site keeps its own install-phase deferral
 * latch, replay predicates, and terminal action, because its callbacks can run
 * reentrantly while `install` is still executing.
 *
 * @internal
 */
export function createOwnedListeners(): {
  /**
   * Installs entries in order. On a failure, removes every listener recorded
   * so far and returns `[installError, ...removalFailures]`; returns an empty
   * array on success.
   */
  install(entries: readonly OwnedListenerEntry[]): unknown[]
  /**
   * Removes the still-owned listeners (optionally only one exact entry) in
   * install order and returns removal failures.
   */
  remove(onlyEntry?: OwnedListenerEntry): unknown[]
} {
  const owned: OwnedListenerEntry[] = []
  const remove = (onlyEntry?: OwnedListenerEntry): unknown[] => {
    const failures: unknown[] = []
    for (let index = 0; index < owned.length; ) {
      const entry = owned[index]
      if (onlyEntry !== undefined && entry !== onlyEntry) {
        index += 1
        continue
      }
      owned.splice(index, 1)
      try {
        entry.target.off(entry.event, entry.listener)
      } catch (error) {
        failures.push(error)
      }
    }
    return failures
  }
  const install = (entries: readonly OwnedListenerEntry[]): unknown[] => {
    for (const entry of entries) {
      owned.push(entry)
      try {
        entry.target.on(entry.event, entry.listener)
      } catch (error) {
        return [error, ...remove()]
      }
    }
    return []
  }
  return { install, remove }
}

/**
 * Installs one silent, idempotent fallback owner before upgrade routing can
 * await. It never removes or replaces listeners installed by an embedding
 * server or the selected transport.
 */
export function ownWebSocketUpgradeSocketErrors(
  req: IncomingMessage,
  socket: Duplex
): void {
  const ownedSocket = socket as Duplex & {
    [RAW_UPGRADE_ERROR_OWNER]?: object
  }
  if (ownedSocket[RAW_UPGRADE_ERROR_OWNER]) return

  const owner = {}
  let installing = true
  let closeRequested = false
  let cleaned = false
  const listeners = createOwnedListeners()
  const destroy = () => {
    try {
      if (!socket.destroyed) socket.destroy()
    } catch {}
  }
  const releaseOwner = () => {
    if (ownedSocket[RAW_UPGRADE_ERROR_OWNER] === owner) {
      delete ownedSocket[RAW_UPGRADE_ERROR_OWNER]
    }
  }
  const cleanup = (): unknown[] => {
    if (cleaned) return []
    if (installing) {
      closeRequested = true
      return []
    }
    cleaned = true
    const failures = listeners.remove()
    releaseOwner()
    return failures
  }
  const onClose = () => {
    if (!isSocketWriteClosed(socket)) return
    for (const failure of cleanup()) {
      try {
        console.error(
          'Failed to remove a WebSocket upgrade socket error owner',
          failure
        )
      } catch {}
    }
  }

  Object.defineProperty(ownedSocket, RAW_UPGRADE_ERROR_OWNER, {
    configurable: true,
    value: owner,
  })
  const installFailures = listeners.install([
    { target: req, event: 'error', listener: destroy },
    { target: socket, event: 'error', listener: destroy },
    { target: socket, event: 'close', listener: onClose },
  ])
  installing = false
  if (installFailures.length > 0) {
    releaseOwner()
    throw combineListenerFailures(
      installFailures,
      'Failed to install the WebSocket upgrade socket error owner'
    )
  }
  if (closeRequested || isSocketWriteClosed(socket)) onClose()
}

async function writeSocket(socket: Duplex, chunk: Uint8Array | string) {
  if (isSocketWriteClosed(socket)) {
    throw createWebSocketClientDisconnectError(
      'WebSocket upgrade client disconnected.'
    )
  }

  try {
    if (socket.write(chunk)) return
  } catch (error) {
    throw markRawSocketIoError(error)
  }

  await new Promise<void>((resolve, reject) => {
    type Outcome = { kind: 'drain' } | { kind: 'error'; error: unknown }
    let settled = false
    let installing = true
    let pendingOutcome: Outcome | undefined
    const listeners = createOwnedListeners()

    const settle = (outcome: Outcome) => {
      if (settled) return
      if (installing) {
        pendingOutcome ??= outcome
        return
      }
      settled = true
      const cleanupFailures = listeners.remove()
      if (cleanupFailures.length > 0) {
        reject(
          combineListenerFailures(
            outcome.kind === 'error'
              ? [outcome.error, ...cleanupFailures]
              : cleanupFailures,
            'Failed to finish a backpressured WebSocket upgrade socket write'
          )
        )
        return
      }
      if (outcome.kind === 'error') reject(outcome.error)
      else resolve()
    }
    const onDrain = () => {
      // `newListener` runs before insertion and can invoke this callback. Only
      // a real drain transition clears writableNeedDrain.
      if (socket.writableNeedDrain === true) return
      settle({ kind: 'drain' })
    }
    const onDisconnect = () => {
      if (!isSocketWriteClosed(socket)) return
      settle({
        kind: 'error',
        error: createWebSocketClientDisconnectError(
          'WebSocket upgrade client disconnected.'
        ),
      })
    }
    const onError = (error: Error) => {
      settle({ kind: 'error', error: markRawSocketIoError(error) })
    }

    // Own ordinary listeners so EventEmitter's once wrapper cannot remove
    // itself through a throwing public removeListener hook before invoking
    // the promise resolver.
    const installFailures = listeners.install([
      { target: socket, event: 'drain', listener: onDrain },
      { target: socket, event: 'close', listener: onDisconnect },
      { target: socket, event: 'error', listener: onError },
    ])
    installing = false
    if (installFailures.length > 0) {
      settled = true
      reject(
        combineListenerFailures(
          installFailures,
          'Failed to install WebSocket upgrade socket backpressure listeners'
        )
      )
      return
    }

    if (pendingOutcome) {
      settle(pendingOutcome)
    } else if (isSocketWriteClosed(socket)) {
      onDisconnect()
    } else if (socket.writableNeedDrain === false) {
      // A drain can race listener installation and is not replayed.
      onDrain()
    }
  })
}

async function endAndDestroySocket(socket: Duplex): Promise<void> {
  if (socket.destroyed) return

  await new Promise<void>((resolve) => {
    let settled = false
    let installing = true
    let finishRequested = false
    const listeners = createOwnedListeners()
    const reportFailures = (failures: unknown[]) => {
      for (const failure of failures) {
        try {
          console.error(
            'Failed to finish closing a raw WebSocket response socket',
            failure
          )
        } catch {}
      }
    }
    const finish = () => {
      if (settled) return
      if (installing) {
        finishRequested = true
        return
      }
      settled = true
      const failures = listeners.remove()
      try {
        if (!socket.destroyed) socket.destroy()
      } catch (error) {
        failures.push(error)
      }
      reportFailures(failures)
      resolve()
    }
    const onTerminal = () => {
      if (isSocketWriteClosed(socket)) finish()
    }
    const onError = (error: Error) => {
      // Ignore only a callback invoked prematurely from newListener. A real
      // emitted socket error is terminal for this final response close even if
      // a custom Duplex updates its state after listeners run.
      if (
        installing &&
        socket.errored !== error &&
        !isSocketWriteClosed(socket)
      ) {
        return
      }
      finish()
    }

    const installFailures = listeners.install([
      { target: socket, event: 'close', listener: onTerminal },
      { target: socket, event: 'error', listener: onError },
    ])
    installing = false
    if (installFailures.length > 0) {
      settled = true
      reportFailures(installFailures)
      try {
        if (!socket.destroyed) socket.destroy()
      } catch (destroyError) {
        reportFailures([destroyError])
      }
      resolve()
      return
    }
    if (finishRequested || isSocketWriteClosed(socket)) {
      finish()
      return
    }
    try {
      socket.end(finish)
    } catch {
      finish()
    }
  })
}

function cancelResponseBody(
  body: ReadableStream<Uint8Array> | null,
  reason: unknown
): void {
  if (!body || body.locked) return
  try {
    void body.cancel(reason).catch(() => {})
  } catch {}
}

function cancelResponseReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: unknown
): void {
  try {
    void reader.cancel(reason).catch(() => {})
  } catch {}
}

function cancelAndReleaseResponseReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: unknown
): void {
  cancelResponseReader(reader, reason)
  try {
    reader.releaseLock()
  } catch {}
}

function destroyRawResponseSocket(socket: Duplex): void {
  try {
    if (!socket.destroyed) socket.destroy()
  } catch {}
}

function getResponseHeaderLines(headers: Headers): string[] {
  const lines: string[] = []

  headers.forEach((value, name) => {
    const lowerName = name.toLowerCase()
    if (isInternalWebSocketResponseHeader(lowerName)) return

    validateHeaderName(name)
    if (lowerName === 'set-cookie') {
      for (const cookie of splitCookiesString(value)) {
        validateHeaderValue(name, cookie)
        lines.push(`${name}: ${cookie}`)
      }
    } else {
      validateResponseHeader(name, value)
      lines.push(`${name}: ${value}`)
    }
  })

  return lines
}

function isInternalWebSocketResponseHeader(name: string): boolean {
  const lowerName = name.toLowerCase()
  return (
    isInternalHeader(lowerName) ||
    lowerName.startsWith('x-middleware-') ||
    lowerName.startsWith('x-nextjs-')
  )
}

export function getUpgradeResponseHeaderLines(response: Response): string[] {
  const headers = new Headers(response.headers)
  for (const name of Array.from(headers.keys())) {
    if (isInternalWebSocketResponseHeader(name)) headers.delete(name)
  }

  for (const name of headers.keys()) {
    if (isForbiddenWebSocketUpgradeResponseHeader(name)) {
      throw new TypeError(
        `A WebSocket upgrade response cannot set the protocol-critical "${name}" header.`
      )
    }
  }

  headers.forEach((value, name) => {
    if (!UPGRADE_RESPONSE_HEADER_VALUE.test(value)) {
      throw new TypeError(
        `WebSocket upgrade response header "${name.toLowerCase()}" must contain only visible ASCII characters, spaces, and tabs.`
      )
    }
  })

  return getResponseHeaderLines(headers)
}

export function isRawHttpResponseCommitted(socket: Duplex): boolean {
  return getRawHttpResponseStatus(socket) !== undefined
}

export function getRawHttpResponseStatus(socket: Duplex): number | undefined {
  return (socket as Duplex & { [RAW_HTTP_RESPONSE_COMMITTED]?: number })[
    RAW_HTTP_RESPONSE_COMMITTED
  ]
}

export function markRawHttpResponseCommitted(
  socket: Duplex,
  statusCode: number
): void {
  const committedStatusCode = getRawHttpResponseStatus(socket)
  if (committedStatusCode !== undefined) {
    throw new Error(
      `Invariant: raw HTTP response already committed with status ${committedStatusCode}.`
    )
  }
  ;(socket as Duplex & { [RAW_HTTP_RESPONSE_COMMITTED]?: number })[
    RAW_HTTP_RESPONSE_COMMITTED
  ] = statusCode
}

/**
 * Writes an ordinary Response directly to a socket received from Node's
 * `upgrade` event. Node never creates a ServerResponse for these requests.
 */
export async function writeRawHttpResponse(
  req: IncomingMessage,
  socket: Duplex,
  response: Response,
  options: { knownContentLength?: number } = {}
): Promise<void> {
  const statusCode = response.status
  let bodyForbidden = false
  let bodyAllowed = false
  let responseHead = Buffer.alloc(0)
  let responseReader: ReadableStreamDefaultReader<Uint8Array> | undefined

  try {
    // `Response.error()` is the one Fetch response shape with status 0. It is
    // not a valid HTTP status line and must fail before the socket is marked
    // committed so the caller can replace it with a 500 response.
    if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode > 599) {
      throw new RangeError(`Invalid raw HTTP response status ${statusCode}.`)
    }

    bodyForbidden =
      req.method === 'HEAD' ||
      statusCode === 204 ||
      statusCode === 205 ||
      statusCode === 304
    bodyAllowed = !bodyForbidden && response.body !== null
    if (
      options.knownContentLength !== undefined &&
      (!Number.isSafeInteger(options.knownContentLength) ||
        options.knownContentLength < 0)
    ) {
      throw new RangeError('Invalid raw HTTP response content length.')
    }
    const responseHeaders = new Headers(response.headers)
    const connectionHeaderTokens = getConnectionHeaderTokens(responseHeaders)
    // The framework owns framing on this raw socket. Forwarding an application
    // supplied length or transfer coding could create an ambiguous response for
    // an intermediary which attempted the upgrade.
    for (const name of RAW_RESPONSE_FRAMING_HEADERS) {
      responseHeaders.delete(name)
    }
    for (const name of connectionHeaderTokens) {
      responseHeaders.delete(name)
    }
    const headerLines = getResponseHeaderLines(responseHeaders)
    headerLines.push('Connection: close')

    if (bodyAllowed && options.knownContentLength !== undefined) {
      headerLines.push(`Content-Length: ${options.knownContentLength}`)
    } else if (
      statusCode === 205 ||
      (!bodyForbidden && response.body === null)
    ) {
      headerLines.push('Content-Length: 0')
    }
    // Unknown-length bodies are delimited by the mandatory connection close.
    // Some WebSocket ingress proxies decode an upstream chunked response but
    // forward its Transfer-Encoding header unchanged; close framing remains
    // correct through those intermediaries and still permits streaming.

    const statusText = response.statusText || STATUS_CODES[statusCode] || ''
    validateHeaderValue('statusText', statusText)
    responseHead = Buffer.from(
      `HTTP/1.1 ${statusCode} ${statusText}\r\n${headerLines.join(
        '\r\n'
      )}\r\n\r\n`,
      'latin1'
    )
    // Take exclusive ownership before the first await. A locked body must fail
    // while an ordinary fallback response can still replace this one, and no
    // other code can race to lock the stream after the response is committed.
    if (bodyAllowed) responseReader = response.body!.getReader()
  } catch (error) {
    if (responseReader) {
      cancelAndReleaseResponseReader(responseReader, error)
    } else {
      cancelResponseBody(response.body, error)
    }
    throw error
  }

  try {
    if (isSocketDisconnected(socket)) {
      throw createWebSocketClientDisconnectError(
        'WebSocket upgrade client disconnected.'
      )
    }
    markRawHttpResponseCommitted(socket, statusCode)
    await writeSocket(socket, responseHead)
  } catch (error) {
    if (responseReader) {
      cancelAndReleaseResponseReader(responseReader, error)
    } else {
      cancelResponseBody(response.body, error)
    }
    if (getRawHttpResponseStatus(socket) !== undefined) {
      destroyRawResponseSocket(socket)
    }
    throw error
  }

  if (bodyAllowed) {
    const reader = responseReader!
    let bodyCancelled = false
    let installingBodyListeners = true
    let pendingCancellation: unknown
    let closeListenerInstalled = false
    let errorListenerInstalled = false
    const removeBodyListeners = (): unknown[] => {
      const failures: unknown[] = []
      if (closeListenerInstalled) {
        closeListenerInstalled = false
        try {
          socket.off('close', onClose)
        } catch (error) {
          failures.push(error)
        }
      }
      if (errorListenerInstalled) {
        errorListenerInstalled = false
        try {
          socket.off('error', onError)
        } catch (error) {
          failures.push(error)
        }
      }
      return failures
    }
    const reportBodyListenerFailures = (failures: unknown[]) => {
      for (const failure of failures) {
        try {
          console.error(
            'Failed to remove raw WebSocket response body listeners',
            failure
          )
        } catch {}
      }
    }
    const cancelBody = (reason: unknown) => {
      if (bodyCancelled) return
      if (installingBodyListeners) {
        pendingCancellation ??= reason
        return
      }
      bodyCancelled = true
      cancelResponseReader(reader, reason)
      reportBodyListenerFailures(removeBodyListeners())
    }
    const onClose = () => {
      if (isSocketWriteClosed(socket)) {
        cancelBody('WebSocket upgrade client disconnected.')
      }
    }
    const onError = (error: Error) => {
      cancelBody(error)
    }
    try {
      closeListenerInstalled = true
      socket.on('close', onClose)
      errorListenerInstalled = true
      socket.on('error', onError)
    } catch (error) {
      installingBodyListeners = false
      const failures = [error, ...removeBodyListeners()]
      cancelResponseReader(reader, error)
      reader.releaseLock()
      destroyRawResponseSocket(socket)
      if (failures.length === 1) throw failures[0]
      throw new AggregateError(
        failures,
        'Failed to install raw WebSocket response body listeners',
        { cause: failures[0] }
      )
    }
    installingBodyListeners = false
    if (pendingCancellation !== undefined) {
      cancelBody(pendingCancellation)
    } else if (isSocketWriteClosed(socket)) {
      onClose()
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!nodeUtilTypes.isUint8Array(value)) {
          throw new TypeError(
            'WebSocket upgrade response bodies must emit Uint8Array chunks.'
          )
        }
        if (!value.byteLength) continue

        await writeSocket(socket, value)
      }
    } catch (error) {
      cancelBody(error)
      destroyRawResponseSocket(socket)
      throw error
    } finally {
      reportBodyListenerFailures(removeBodyListeners())
      reader.releaseLock()
    }
  } else {
    // HEAD, 204, 205, and 304 responses cannot carry a body on the wire. Start
    // cancellation so a streaming producer does not remain live, but do not
    // let producer cleanup delay or fail the already-written raw response.
    cancelResponseBody(
      response.body,
      'Response body omitted by HTTP semantics.'
    )
  }

  if (!isSocketWriteClosed(socket)) {
    await endAndDestroySocket(socket)
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
  const connectionHeaderTokens = getConnectionHeaderTokens(responseHeaders)
  // The framework owns this representation, regardless of which routing
  // headers preceded it. Do not describe the new plaintext bytes with stale
  // application metadata.
  for (const name of Array.from(responseHeaders.keys())) {
    if (
      connectionHeaderTokens.has(name.toLowerCase()) ||
      isRawHttpErrorForbiddenHeader(name)
    ) {
      responseHeaders.delete(name)
    }
  }
  for (const name of RAW_RESPONSE_FRAMING_HEADERS) {
    responseHeaders.delete(name)
  }
  // Impose the canonical representation only after all inherited and
  // nominated metadata has been removed. A caller cannot nominate these
  // fields away or provide an alternate cache policy.
  responseHeaders.set('content-type', 'text/plain; charset=utf-8')
  responseHeaders.set('cache-control', RAW_HTTP_ERROR_CACHE_CONTROL)

  const body = Buffer.from(message)
  return writeRawHttpResponse(
    req,
    socket,
    new Response(body, {
      status,
      headers: responseHeaders,
    }),
    { knownContentLength: body.byteLength }
  )
}

export interface WebSocketHandshakeError {
  status: number
  message: string
  headers?: HeadersInit
}

export type WebSocketUpgradePreflightResult =
  | { kind: 'not-websocket' }
  | { kind: 'continue-routing' }
  | { kind: 'rejected'; statusCode: number }

/**
 * Rejects request framing which is ambiguous to an HTTP upgrade proxy. This
 * check is safe to run before route ownership is known.
 */
export function validateWebSocketUpgradeFraming(
  req: IncomingMessage
): WebSocketHandshakeError | undefined {
  if (
    hasRequestHeader(req, 'content-length') ||
    hasRequestHeader(req, 'transfer-encoding') ||
    hasRequestHeader(req, 'expect') ||
    hasRequestHeader(req, 'trailer')
  ) {
    return {
      status: 400,
      message: 'WebSocket upgrade requests cannot include HTTP body framing.',
    }
  }

  return undefined
}

/**
 * Strips headers which are meaningful only between trusted Next.js processes.
 */
export function filterWebSocketUpgradeRequestHeaders(
  req: IncomingMessage
): void {
  const filteredRequest = req as IncomingMessage & {
    [WEBSOCKET_UPGRADE_HEADERS_FILTERED]?: true
  }
  if (filteredRequest[WEBSOCKET_UPGRADE_HEADERS_FILTERED]) return

  if (!process.env.NEXT_PRIVATE_TEST_HEADERS) {
    filterInternalHeaders(req.headers)
    // Node lazily derives headersDistinct from rawHeaders and retains the
    // parser's original header count. Materialize and sanitize that view
    // before compacting rawHeaders so the two representations stay coherent.
    if (req.headersDistinct) {
      filterInternalHeaders(req.headersDistinct)
    }
    filterInternalRawHeaders(req.rawHeaders)
  }
  filteredRequest[WEBSOCKET_UPGRADE_HEADERS_FILTERED] = true
}

/**
 * Applies the owner-neutral WebSocket upgrade checks which must run before
 * upgrade routing. Full handshake and origin policy belong to the selected
 * Next.js App Route or external upgrade owner.
 */
export async function preflightWebSocketUpgrade(
  req: IncomingMessage,
  socket: Duplex
): Promise<WebSocketUpgradePreflightResult> {
  if (!isWebSocketUpgradeRequest(req)) {
    return { kind: 'not-websocket' }
  }

  ownWebSocketUpgradeSocketErrors(req, socket)

  const committedStatusCode = getRawHttpResponseStatus(socket)
  if (committedStatusCode !== undefined) {
    throw new Error(
      `Invariant: raw HTTP response already committed with status ${committedStatusCode}.`
    )
  }

  filterWebSocketUpgradeRequestHeaders(req)
  const framingError = validateWebSocketUpgradeFraming(req)
  if (!framingError) {
    return { kind: 'continue-routing' }
  }

  try {
    await writeRawHttpError(
      req,
      socket,
      framingError.status,
      framingError.message,
      framingError.headers
    )
  } catch (error) {
    if (!isWebSocketClientDisconnectError(error)) throw error
    try {
      if (!socket.destroyed) socket.destroy()
    } catch {}
  }
  return { kind: 'rejected', statusCode: framingError.status }
}

/**
 * Validates protocol fields which must be safe before user code executes.
 */
export function validateWebSocketHandshake(
  req: IncomingMessage
): WebSocketHandshakeError | undefined {
  if (req.httpVersion !== '1.1') {
    return { status: 400, message: 'WebSocket upgrades require HTTP/1.1.' }
  }
  if (req.method !== 'GET') {
    return {
      status: 405,
      message: 'WebSocket upgrades require GET.',
      headers: { allow: 'GET' },
    }
  }

  const framingError = validateWebSocketUpgradeFraming(req)
  if (framingError) return framingError

  if (getRawHeaderValues(req, 'host').length !== 1) {
    return { status: 400, message: 'Invalid WebSocket Host header.' }
  }
  if (getRawHeaderValues(req, 'upgrade').length !== 1) {
    return { status: 400, message: 'Invalid WebSocket Upgrade header.' }
  }
  if (getRawHeaderValues(req, 'sec-websocket-version').length !== 1) {
    return {
      status: 426,
      message: 'Unsupported WebSocket version.',
      headers: { 'sec-websocket-version': '13' },
    }
  }
  if (getRawHeaderValues(req, 'sec-websocket-key').length !== 1) {
    return { status: 400, message: 'Invalid Sec-WebSocket-Key header.' }
  }
  if (getRawHeaderValues(req, 'origin').length > 1) {
    return { status: 400, message: 'Invalid WebSocket Origin header.' }
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
  if (typeof host !== 'string' || !getWebSocketRequestAuthority(req)) {
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
  if (protocolHeader !== undefined) {
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

  const extensionHeaders = getRawHeaderValues(req, 'sec-websocket-extensions')
  if (extensionHeaders.length > 0) {
    const parseExtensions = getWebSocketExtensionParser()
    try {
      // RFC 6455 requires malformed extension grammar to fail the handshake,
      // even when this transport declines every well-formed extension offer.
      // Use the parser from the pinned ws transport so syntax cannot drift.
      parseExtensions(extensionHeaders.join(','))
    } catch {
      return {
        status: 400,
        message: 'Invalid Sec-WebSocket-Extensions header.',
      }
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

/** Enforces browser-origin isolation before an App Route GET executes. */
export function validateWebSocketOrigin(
  req: IncomingMessage,
  allowedOrigins: unknown = []
): WebSocketHandshakeError | undefined {
  const originValues = getRawHeaderValues(req, 'origin')
  if (originValues.length === 0) return undefined
  if (originValues.length !== 1) {
    return { status: 403, message: 'WebSocket origin is not allowed.' }
  }
  const originHeader = originValues[0]

  if (!isExactWebSocketOrigin(originHeader)) {
    return { status: 403, message: 'WebSocket origin is not allowed.' }
  }
  const origin = new URL(originHeader)

  const requestAuthority = getWebSocketRequestAuthority(req)
  if (!requestAuthority) {
    return { status: 400, message: 'Invalid WebSocket Host header.' }
  }

  if (
    Array.isArray(allowedOrigins) &&
    allowedOrigins.some(
      (allowedOrigin) =>
        typeof allowedOrigin === 'string' && allowedOrigin === origin.origin
    )
  ) {
    return undefined
  }

  // Use raw wire headers rather than normalized headers which Proxy or rewrites
  // may have replaced. Do not trust forwarding headers here: deployments which
  // intentionally change Host can use the exact allowedOrigins configuration.

  if (requestAuthority.origin !== origin.origin) {
    return { status: 403, message: 'WebSocket origin is not allowed.' }
  }

  return undefined
}

/** @internal Enforces server-controlled protocol selection after the handler returns. */
export function validateWebSocketRequestPolicy(
  req: IncomingMessage,
  metadata: WebSocketUpgradeMetadata
): WebSocketHandshakeError | undefined {
  if (metadata.protocol && !getRequestedProtocols(req).has(metadata.protocol)) {
    return {
      status: 400,
      message: 'Selected WebSocket subprotocol was not offered by the client.',
    }
  }

  return undefined
}

/** @internal */
export function isForbiddenWebSocketUpgradeResponseHeader(
  name: string
): boolean {
  return FORBIDDEN_UPGRADE_HEADERS.has(name.toLowerCase())
}
