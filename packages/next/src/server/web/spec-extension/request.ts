import type { I18NConfig } from '../../config-shared'
import { NextURL } from '../next-url'
import { toNodeOutgoingHttpHeaders, validateURL } from '../utils'
import { RemovedUAError, RemovedPageError } from '../error'
import { RequestCookies } from './cookies'

export const INTERNALS = Symbol('internal request')

/**
 * The headers of a request as `RequestCookies` uses them: it reads the
 * `cookie` header once, when it is constructed, and sets that header when a
 * cookie changes. The first read is answered with `cookie`; everything else
 * goes to `headers`.
 */
function withInitialCookie(headers: Headers, cookie: string | null): Headers {
  let initial = true
  const view: Pick<Headers, 'get' | 'set' | 'delete'> = {
    get(name) {
      if (initial && name === 'cookie') {
        initial = false
        return cookie
      }
      return headers.get(name)
    },
    set(name, value) {
      headers.set(name, value)
    },
    delete(name) {
      headers.delete(name)
    },
  }
  return view as Headers
}

/**
 * This class extends the [Web `Request` API](https://developer.mozilla.org/docs/Web/API/Request) with additional convenience methods.
 *
 * Read more: [Next.js Docs: `NextRequest`](https://nextjs.org/docs/app/api-reference/functions/next-request)
 */
export class NextRequest extends Request {
  /** @internal */
  [INTERNALS]: {
    /** Created when the cookies are first read. */
    cookies: RequestCookies | undefined
    /** The `cookie` header the request had when it was constructed. */
    cookie: string | null
    url: string
    nextUrl: NextURL
  }

  constructor(input: URL | RequestInfo, init: RequestInit = {}) {
    const url =
      typeof input !== 'string' && 'url' in input ? input.url : String(input)

    validateURL(url)

    // node Request instance requires duplex option when a body
    // is present or it errors, we don't handle this for
    // Request being passed in since it would have already
    // errored if this wasn't configured
    if (process.env.NEXT_RUNTIME !== 'edge') {
      if (init.body && init.duplex !== 'half') {
        init.duplex = 'half'
      }
    }

    if (input instanceof Request) super(input, init)
    else super(url, init)

    const nextUrl = new NextURL(url, {
      headers: toNodeOutgoingHttpHeaders(this.headers),
      nextConfig: init.nextConfig,
    })
    this[INTERNALS] = {
      cookies: undefined,
      cookie: this.headers.get('cookie'),
      nextUrl,
      url: process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE
        ? url
        : nextUrl.toString(),
    }
  }

  [Symbol.for('edge-runtime.inspect.custom')]() {
    return {
      cookies: this.cookies,
      nextUrl: this.nextUrl,
      url: this.url,
      // rest of props come from Request
      bodyUsed: this.bodyUsed,
      cache: this.cache,
      credentials: this.credentials,
      destination: this.destination,
      headers: Object.fromEntries(this.headers),
      integrity: this.integrity,
      keepalive: this.keepalive,
      method: this.method,
      mode: this.mode,
      redirect: this.redirect,
      referrer: this.referrer,
      referrerPolicy: this.referrerPolicy,
      signal: this.signal,
    }
  }

  public get cookies() {
    const internals = this[INTERNALS]
    let cookies = internals.cookies
    if (cookies === undefined) {
      // The cookies are parsed when they are first read, not for every
      // request. They are the cookies of the request as it was constructed:
      // the header is taken then, so a change to `headers` in between does
      // not show, as before.
      cookies = internals.cookies = new RequestCookies(
        withInitialCookie(this.headers, internals.cookie)
      )
    }
    return cookies
  }

  public get nextUrl() {
    return this[INTERNALS].nextUrl
  }

  /**
   * @deprecated
   * `page` has been deprecated in favour of `URLPattern`.
   * Read more: https://nextjs.org/docs/messages/middleware-request-page
   */
  public get page() {
    throw new RemovedPageError()
  }

  /**
   * @deprecated
   * `ua` has been removed in favour of \`userAgent\` function.
   * Read more: https://nextjs.org/docs/messages/middleware-parse-user-agent
   */
  public get ua() {
    throw new RemovedUAError()
  }

  public get url() {
    return this[INTERNALS].url
  }
}

export interface RequestInit extends globalThis.RequestInit {
  nextConfig?: {
    basePath?: string
    i18n?: I18NConfig | null
    trailingSlash?: boolean
  }
  signal?: AbortSignal
  // see https://github.com/whatwg/fetch/pull/1457
  duplex?: 'half'
}
