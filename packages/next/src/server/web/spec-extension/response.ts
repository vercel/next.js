import { stringifyCookie } from '../../web/spec-extension/cookies'
import type { I18NConfig } from '../../config-shared'
import { NextURL } from '../next-url'
import { toNodeOutgoingHttpHeaders, validateURL } from '../utils'
import { ReflectAdapter } from './adapters/reflect'
import { ResponseCookies } from './cookies'

const INTERNALS = Symbol('internal response')
const WEBSOCKET_UPGRADE = Symbol.for('next.internal.websocket-upgrade-response')
const REDIRECTS = new Set([301, 302, 303, 307, 308])
const WEBSOCKET_HOOKS = new Set(['open', 'message', 'close', 'error'])

export type WebSocketPeer = import('next/dist/compiled/crossws').Peer
export type WebSocketMessage = import('next/dist/compiled/crossws').Message
export type WebSocketError = import('next/dist/compiled/crossws').WSError
export type WebSocketCloseDetails = {
  code?: number
  reason?: string
}
export type WebSocketHooks = Pick<
  Partial<import('next/dist/compiled/crossws').Hooks>,
  'open' | 'message' | 'close' | 'error'
>

export interface WebSocketUpgradeMetadata {
  hooks: WebSocketHooks
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

  static upgrade(hooks: WebSocketHooks): NextResponse<null> {
    if (process.env.NEXT_RUNTIME === 'edge') {
      throw new Error(
        'NextResponse.upgrade() is not supported in the Edge Runtime.'
      )
    }

    if (!process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS) {
      throw new Error(
        'NextResponse.upgrade() requires experimental.webSocketRouteHandlers to be enabled in next.config.js.'
      )
    }

    if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) {
      throw new TypeError('NextResponse.upgrade() requires a hooks object.')
    }

    for (const name of Object.keys(hooks)) {
      if (!WEBSOCKET_HOOKS.has(name)) {
        throw new TypeError(
          `NextResponse.upgrade() does not support the "${name}" hook.`
        )
      }
    }

    for (const name of ['open', 'message', 'close', 'error'] as const) {
      if (hooks[name] !== undefined && typeof hooks[name] !== 'function') {
        throw new TypeError(
          `NextResponse.upgrade() hook "${name}" must be a function.`
        )
      }
    }

    return new WebSocketUpgradeResponse(hooks)
  }
}

class WebSocketUpgradeResponse extends NextResponse<null> {
  constructor(hooks: WebSocketHooks, headers?: HeadersInit) {
    super(null, { headers })
    Object.defineProperty(this, WEBSOCKET_UPGRADE, {
      value: { hooks } satisfies WebSocketUpgradeMetadata,
    })
  }

  clone(): WebSocketUpgradeResponse {
    const metadata = getWebSocketUpgradeMetadata(this)!
    return new WebSocketUpgradeResponse(
      metadata.hooks,
      new Headers(this.headers)
    )
  }
}

/** @internal */
export function getWebSocketUpgradeMetadata(
  response: Response
): WebSocketUpgradeMetadata | undefined {
  return (
    response as Response & {
      [WEBSOCKET_UPGRADE]?: WebSocketUpgradeMetadata
    }
  )[WEBSOCKET_UPGRADE]
}

/** @internal */
export function isWebSocketUpgradeResponse(
  response: Response
): response is NextResponse<null> {
  return getWebSocketUpgradeMetadata(response) !== undefined
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
