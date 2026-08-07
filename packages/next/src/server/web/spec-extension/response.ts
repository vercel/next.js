import { stringifyCookie } from '../../web/spec-extension/cookies'
import type { I18NConfig } from '../../config-shared'
import { NextURL } from '../next-url'
import { toNodeOutgoingHttpHeaders, validateURL } from '../utils'
import { ReflectAdapter } from './adapters/reflect'
import { ResponseCookies } from './cookies'
import type { NextRequest } from './request'
import {
  getWebSocketUpgradeMetadata as getInternalWebSocketUpgradeMetadata,
  setWebSocketUpgradeMetadata,
} from './websocket-upgrade-response'
import { HTTP_TOKEN as WEBSOCKET_TOKEN } from './websocket-connection-headers'

const INTERNALS = Symbol('internal response')
const REDIRECTS = new Set([301, 302, 303, 307, 308])
const WEBSOCKET_HOOKS = new Set(['open', 'message', 'close', 'error'])
const WEBSOCKET_UPGRADE_OPTIONS = new Set(['protocol'])

function readOwnProperty<T>(object: object, name: string): T | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(object, name)
  if (!descriptor) return undefined
  return (
    'value' in descriptor ? descriptor.value : descriptor.get?.call(object)
  ) as T | undefined
}

/** @experimental WebSocket Route Handlers are an experimental feature. */
export type WebSocketMessageData =
  | string
  | ArrayBuffer
  | SharedArrayBuffer
  | ArrayBufferView

/** @experimental WebSocket Route Handlers are an experimental feature. */
export interface WebSocketPeer {
  /** Unique identifier for this connection. */
  readonly id: string
  /** Remote IP address when the transport exposes one. */
  readonly remoteAddress: string | undefined
  /** The request which opened this connection. */
  readonly request: NextRequest
  /** Bytes queued by the transport but not yet written to the network. */
  readonly bufferedAmount: number
  /**
   * Starts the closing handshake. `code` must be an integer from 1000 through
   * 1014 (excluding 1004, 1005, and 1006), or from 3000 through 4999. `reason`
   * must be at most 123 UTF-8 bytes. Invalid arguments throw synchronously,
   * including after closing has started. A reason without a code is ignored.
   */
  close(code?: number, reason?: string): void
  terminate(): void
  send(data: WebSocketMessageData): number
}

/** @experimental WebSocket Route Handlers are an experimental feature. */
export interface WebSocketMessage {
  readonly rawData: string | Uint8Array
  uint8Array(): Uint8Array
  arrayBuffer(): ArrayBuffer
  text(): string
  json<T = unknown>(): T
}

/** @experimental WebSocket Route Handlers are an experimental feature. */
export type WebSocketCloseDetails = {
  code: number
  reason: string
}

/** @experimental WebSocket Route Handlers are an experimental feature. */
export interface WebSocketHooks {
  open?: (peer: WebSocketPeer) => void | Promise<void>
  message?: (
    peer: WebSocketPeer,
    message: WebSocketMessage
  ) => void | Promise<void>
  close?: (
    peer: WebSocketPeer,
    details: WebSocketCloseDetails
  ) => void | Promise<void>
  error?: (peer: WebSocketPeer, error: Error) => void | Promise<void>
}

/** @internal */
export interface WebSocketUpgradeMetadata {
  readonly hooks: Readonly<WebSocketHooks>
  readonly protocol?: string
}

/** @experimental WebSocket Route Handlers are an experimental feature. */
export interface WebSocketUpgradeOptions {
  /** A single server-selected subprotocol offered by the client. */
  protocol?: string
}

function handleMiddlewareField(
  init: MiddlewareResponseInit | undefined,
  headers: Headers
) {
  if (init?.request?.headers) {
    if (!(init.request.headers instanceof Headers)) {
      throw new Error('request.headers must be an instance of Headers')
    }

    const keys = []
    for (const [key, value] of init.request.headers) {
      headers.set('x-middleware-request-' + key, value)
      keys.push(key)
    }

    headers.set('x-middleware-override-headers', keys.join(','))
  }
}

/**
 * This class extends the [Web `Response` API](https://developer.mozilla.org/docs/Web/API/Response) with additional convenience methods.
 *
 * Read more: [Next.js Docs: `NextResponse`](https://nextjs.org/docs/app/api-reference/functions/next-response)
 */
export class NextResponse<Body = unknown> extends Response {
  [INTERNALS]: {
    cookies: ResponseCookies
    url?: NextURL
    body?: Body
  }

  constructor(body?: BodyInit | null, init: ResponseInit = {}) {
    super(body, init)

    const headers = this.headers
    const cookies = new ResponseCookies(headers)

    const cookiesProxy = new Proxy(cookies, {
      get(target, prop, receiver) {
        switch (prop) {
          case 'delete':
          case 'set': {
            return (...args: [string, string]) => {
              const result = Reflect.apply(target[prop], target, args)
              const newHeaders = new Headers(headers)

              if (result instanceof ResponseCookies) {
                headers.set(
                  'x-middleware-set-cookie',
                  result
                    .getAll()
                    .map((cookie) => stringifyCookie(cookie))
                    .join(',')
                )
              }

              handleMiddlewareField(init, newHeaders)
              return result
            }
          }
          default:
            return ReflectAdapter.get(target, prop, receiver)
        }
      },
    })

    this[INTERNALS] = {
      cookies: cookiesProxy,
      url: init.url
        ? new NextURL(init.url, {
            headers: toNodeOutgoingHttpHeaders(headers),
            nextConfig: init.nextConfig,
          })
        : undefined,
    }
  }

  [Symbol.for('edge-runtime.inspect.custom')]() {
    return {
      cookies: this.cookies,
      url: this.url,
      // rest of props come from Response
      body: this.body,
      bodyUsed: this.bodyUsed,
      headers: Object.fromEntries(this.headers),
      ok: this.ok,
      redirected: this.redirected,
      status: this.status,
      statusText: this.statusText,
      type: this.type,
    }
  }

  public get cookies() {
    return this[INTERNALS].cookies
  }

  static json<JsonBody>(
    body: JsonBody,
    init?: ResponseInit
  ): NextResponse<JsonBody> {
    const response: Response = Response.json(body, init)
    return new NextResponse(response.body, response)
  }

  static redirect(url: string | NextURL | URL, init?: number | ResponseInit) {
    const status = typeof init === 'number' ? init : (init?.status ?? 307)
    if (!REDIRECTS.has(status)) {
      throw new RangeError(
        'Failed to execute "redirect" on "response": Invalid status code'
      )
    }
    const initObj = typeof init === 'object' ? init : {}
    const headers = new Headers(initObj?.headers)
    headers.set('Location', validateURL(url))

    return new NextResponse(null, {
      ...initObj,
      headers,
      status,
    })
  }

  static rewrite(
    destination: string | NextURL | URL,
    init?: MiddlewareResponseInit
  ) {
    const headers = new Headers(init?.headers)
    headers.set('x-middleware-rewrite', validateURL(destination))

    handleMiddlewareField(init, headers)
    return new NextResponse(null, { ...init, headers })
  }

  static next(init?: MiddlewareResponseInit) {
    const headers = new Headers(init?.headers)
    headers.set('x-middleware-next', '1')

    handleMiddlewareField(init, headers)
    return new NextResponse(null, { ...init, headers })
  }

  /** @experimental WebSocket Route Handlers are an experimental feature. */
  static upgrade(
    hooks: WebSocketHooks,
    options: WebSocketUpgradeOptions = {}
  ): NextResponse<null> {
    if (process.env.NEXT_RUNTIME === 'edge') {
      throw new Error(
        'NextResponse.upgrade() is not supported in the Edge Runtime.'
      )
    }

    if (
      !hooks ||
      typeof hooks !== 'object' ||
      Array.isArray(hooks) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(hooks))
    ) {
      throw new TypeError('NextResponse.upgrade() requires a hooks object.')
    }

    for (const name of Reflect.ownKeys(hooks)) {
      if (typeof name !== 'string' || !WEBSOCKET_HOOKS.has(name)) {
        throw new TypeError(
          `NextResponse.upgrade() does not support the "${String(name)}" hook.`
        )
      }
    }

    const open = readOwnProperty<WebSocketHooks['open']>(hooks, 'open')
    const message = readOwnProperty<WebSocketHooks['message']>(hooks, 'message')
    const close = readOwnProperty<WebSocketHooks['close']>(hooks, 'close')
    const error = readOwnProperty<WebSocketHooks['error']>(hooks, 'error')
    const hookSnapshot = { open, message, close, error }

    for (const name of ['open', 'message', 'close', 'error'] as const) {
      const hook = hookSnapshot[name]
      if (hook !== undefined && typeof hook !== 'function') {
        throw new TypeError(
          `NextResponse.upgrade() hook "${name}" must be a function.`
        )
      }
    }

    if (
      !options ||
      typeof options !== 'object' ||
      Array.isArray(options) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(options))
    ) {
      throw new TypeError('NextResponse.upgrade() options must be an object.')
    }
    for (const name of Reflect.ownKeys(options)) {
      if (typeof name !== 'string' || !WEBSOCKET_UPGRADE_OPTIONS.has(name)) {
        throw new TypeError(
          `NextResponse.upgrade() does not support the "${String(name)}" option.`
        )
      }
    }

    const protocol = readOwnProperty<WebSocketUpgradeOptions['protocol']>(
      options,
      'protocol'
    )
    if (
      protocol !== undefined &&
      (typeof protocol !== 'string' || !WEBSOCKET_TOKEN.test(protocol))
    ) {
      throw new TypeError(
        'NextResponse.upgrade() protocol must be a valid WebSocket subprotocol token.'
      )
    }

    const frozenHooks = Object.freeze({
      ...(open === undefined ? undefined : { open }),
      ...(message === undefined ? undefined : { message }),
      ...(close === undefined ? undefined : { close }),
      ...(error === undefined ? undefined : { error }),
    })
    const metadata = Object.freeze({
      hooks: frozenHooks,
      ...(protocol === undefined ? undefined : { protocol }),
    })

    return new WebSocketUpgradeResponse(metadata)
  }
}

class WebSocketUpgradeResponse extends NextResponse<null> {
  constructor(metadata: WebSocketUpgradeMetadata, headers?: HeadersInit) {
    super(null, { headers })
    setWebSocketUpgradeMetadata(this, metadata)
  }

  clone(): WebSocketUpgradeResponse {
    const metadata = getWebSocketUpgradeMetadata(this)!
    return new WebSocketUpgradeResponse(metadata, new Headers(this.headers))
  }
}

/** @internal */
export function getWebSocketUpgradeMetadata(
  response: Response
): WebSocketUpgradeMetadata | undefined {
  return getInternalWebSocketUpgradeMetadata(response) as
    | WebSocketUpgradeMetadata
    | undefined
}

interface ResponseInit extends globalThis.ResponseInit {
  nextConfig?: {
    basePath?: string
    i18n?: I18NConfig
    trailingSlash?: boolean
  }
  url?: string
}

interface ModifiedRequest {
  /**
   * If this is set, the request headers will be overridden with this value.
   */
  headers?: Headers
}

interface MiddlewareResponseInit extends globalThis.ResponseInit {
  /**
   * These fields will override the request from clients.
   */
  request?: ModifiedRequest
}
