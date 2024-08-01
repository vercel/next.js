import type { I18NConfig } from '../../config-shared'
import { NextURL } from '../next-url'
import { toNodeOutgoingHttpHeaders, validateURL } from '../utils'
import { RemovedUAError, RemovedPageError } from '../error'
import { RequestCookies } from './cookies'

export const INTERNALS = Symbol('internal request')

/**
 * This class extends the [Web `Request` API](https://developer.mozilla.org/docs/Web/API/Request) with additional convenience methods.
 *
 * Read more: [Next.js Docs: `NextRequest`](https://nextjs.org/docs/app/api-reference/functions/next-request)
 */
export class NextRequest extends Request {
  [INTERNALS]: {
    cookies: RequestCookies
    url: string
    nextUrl: NextURL
  }

  constructor(input: URL | RequestInfo, init: RequestInit = {}) {
    const url =
      typeof input !== 'string' && 'url' in input ? input.url : String(input)
    validateURL(url)
    if (input instanceof Request) super(input, init)
    else super(url, init)
    const nextUrl = new NextURL(url, {
      headers: toNodeOutgoingHttpHeaders(this.headers),
      nextConfig: init.nextConfig,
    })
    this[INTERNALS] = {
      cookies: new RequestCookies(this.headers),
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
    return this[INTERNALS].cookies
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
}
