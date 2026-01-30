import { stringifyCookie } from '../../web/spec-extension/cookies'
import type { I18NConfig } from '../../config-shared'
import { NextURL } from '../next-url'
import { toNodeOutgoingHttpHeaders, validateURL } from '../utils'
import { ReflectAdapter } from './adapters/reflect'

import { ResponseCookies } from './cookies'
import {
  type NextWebSocket,
  createWebSocketPair,
  WEBSOCKET_INTERNAL,
  type WebSocketCloseMessage,
} from './websocket'

const INTERNALS = Symbol('internal response')
const REDIRECTS = new Set([301, 302, 303, 307, 308])

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
// WebSocket internal data type
interface WebSocketInternalData {
  readable: ReadableStream<
    string | ArrayBufferLike | Blob | ArrayBufferView | WebSocketCloseMessage
  >
  writable: WritableStream
}

export class NextResponse<Body = unknown> extends Response {
  [INTERNALS]: {
    cookies: ResponseCookies
    url?: NextURL
    body?: Body
  };

  // WebSocket internal storage
  [WEBSOCKET_INTERNAL]?: WebSocketInternalData

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

  /**
   * Creates a WebSocket upgrade response. Returns a tuple of [socket, response].
   *
   * The socket must have `accept()` called before sending messages.
   *
   * @example
   * ```ts
   * import { NextResponse } from 'next/server'
   *
   * export const GET = async () => {
   *   const [socket, response] = NextResponse.upgrade()
   *
   *   socket.accept()
   *   socket.send("WELCOME")
   *
   *   socket.addEventListener("message", (event) => {
   *     socket.send("ECHO: " + event.data)
   *   })
   *
   *   socket.addEventListener("close", () => {
   *     console.log("Connection closed")
   *   })
   *
   *   return response
   * }
   * ```
   */
  static upgrade(init?: {
    headers?: HeadersInit
  }): [NextWebSocket, NextResponse] {
    const { socket, readable, writable } = createWebSocketPair()

    const headers = new Headers(init?.headers)
    // Mark this response as a WebSocket upgrade
    // We use 200 status code because the Web API doesn't allow 101
    // The server will detect the x-next-websocket-upgrade header and handle it
    headers.set('x-next-websocket-upgrade', '1')

    const response = new NextResponse(null, {
      status: 200,
      headers,
    })

    // Store the WebSocket streams internally for the server to access
    response[WEBSOCKET_INTERNAL] = { readable, writable }

    return [socket, response]
  }
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
