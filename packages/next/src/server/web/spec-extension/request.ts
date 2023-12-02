import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { I18NConfig } from '../../config-shared'
import type { RequestData } from '../types'
import { NextURL } from '../next-url'
import { toNodeOutgoingHttpHeaders, validateURL } from '../utils'
import { RemovedUAError, RemovedPageError } from '../error'
import { RequestCookies } from './cookies'
import { markSocketUpgraded } from './request-upgrade'
import { scheduleOnNextTick } from '../../../lib/scheduler'

export const RequestUpgradedName = 'RequestUpgraded'
export class RequestUpgraded extends Error {
  public readonly name = RequestUpgradedName
}

export function isUpgradeError(
  e: any
): e is Error & { name: typeof RequestUpgradedName } {
  return e?.name === RequestUpgradedName
}

export const INTERNALS = Symbol('internal request')

export class NextRequest extends Request {
  [INTERNALS]: {
    cookies: RequestCookies
    geo: RequestData['geo']
    ip?: string
    url: string
    nextUrl: NextURL
    rawRequest?: IncomingMessage
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
      geo: init.geo || {},
      ip: init.ip,
      nextUrl,
      url: process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE
        ? url
        : nextUrl.toString(),
      rawRequest: init.rawRequest,
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

  public upgrade(
    handler: (request: IncomingMessage, socket: Duplex) => void
  ): never {
    const rawRequest = this[INTERNALS].rawRequest
    if (!rawRequest) {
      throw new Error(
        'Cannot upgrade to websocket, this feature is not compatible with the edge runtime.'
      )
    }

    markSocketUpgraded(rawRequest.socket)
    scheduleOnNextTick(() => handler(rawRequest, rawRequest.socket))

    throw new RequestUpgraded('upgrade')
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
  signal?: AbortSignal
  rawRequest?: IncomingMessage
}
