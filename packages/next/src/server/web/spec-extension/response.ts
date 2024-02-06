import type { I18NConfig } from '../../config-shared'
import { NextURL } from '../next-url'
import { toNodeOutgoingHttpHeaders, validateURL } from '../utils'

import { ResponseCookies } from './cookies'

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
export class NextResponse<Body = unknown> extends Response {
  [INTERNALS]: {
    cookies: ResponseCookies
    url?: NextURL
    body?: Body
  }

  constructor(body?: BodyInit | null, init: ResponseInit = {}) {
    super(body, init)

    this[INTERNALS] = {
      cookies: new ResponseCookies(this.headers),
      url: init.url
        ? new NextURL(init.url, {
            headers: toNodeOutgoingHttpHeaders(this.headers),
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
    const status = typeof init === 'number' ? init : init?.status ?? 307
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
