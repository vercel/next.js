import type { I18NConfig } from '../../config-shared'
import type { RequestData } from '../types'
import { NextURL } from '../next-url'
import { toNodeHeaders, validateURL } from '../utils'
import { RemovedUAError, RemovedPageError } from '../error'
import { NextCookies } from './cookies'

export const INTERNALS = Symbol('internal request')

export class NextRequest extends Request {
  [INTERNALS]: {
    cookies: NextCookies
    geo: RequestData['geo']
    ip?: string
    url: NextURL
  }

  constructor(input: Request | string, init: RequestInit = {}) {
    const url = typeof input === 'string' ? input : input.url
    validateURL(url)
    super(input, init)
    this[INTERNALS] = {
      cookies: new NextCookies(this),
      geo: init.geo || {},
      ip: init.ip,
      url: new NextURL(url, {
        headers: toNodeHeaders(this.headers),
        nextConfig: init.nextConfig,
      }),
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
