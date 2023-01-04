import type { I18NConfig } from '../../config-shared'
import type { RequestData } from '../types'
import { NextURL } from '../next-url'
import { toNodeHeaders, validateURL } from '../utils'
import { RemovedUAError, RemovedPageError } from '../error'
import { RequestCookies } from './cookies'

export const INTERNALS = Symbol('internal request')

export class NextRequest extends Request {
  [INTERNALS]: {
    cookies: RequestCookies
    geo: RequestData['geo']
    ip?: string
    url: NextURL
  }

  constructor(input: URL | RequestInfo, init: RequestInit = {}) {
    const url =
      typeof input !== 'string' && 'url' in input ? input.url : String(input)
    validateURL(url)
    super(url, init)
    this[INTERNALS] = {
      cookies: new RequestCookies(this.headers),
      geo: init.geo || {},
      ip: init.ip,
      url: new NextURL(url, {
        headers: toNodeHeaders(this.headers),
        nextConfig: init.nextConfig,
      }),
    }
  }

  [Symbol.for('edge-runtime.inspect.custom')]() {
    return {
      cookies: this.cookies,
      geo: this.geo,
      ip: this.ip,
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

  public get geo() {
    return this[INTERNALS].geo
  }

  public get ip() {
    return this[INTERNALS].ip
  }

  public get nextUrl() {
    return this[INTERNALS].url
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
    return this[INTERNALS].url.toString()
  }
}

export interface RequestInit extends globalThis.RequestInit {
  geo?: {
    city?: string
    country?: string
    region?: string
  }
  ip?: string
  nextConfig?: {
    basePath?: string
    i18n?: I18NConfig | null
    trailingSlash?: boolean
  }
}
