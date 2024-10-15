import type { I18NConfig } from '../../config-shared'
import { NextURL } from '../next-url'
import { toNodeOutgoingHttpHeaders, validateURL } from '../utils'
import { RemovedUAError, RemovedPageError } from '../error'
import { RequestCookies } from './cookies'
import type { BaseNextResponse, NextBaseRequestContext } from '../../base-http'

const INTERNALS = Symbol.for('next.internal.NextRequest.internals')

export const NEXT_REQUEST_CONTEXT_PARAM = Symbol.for(
  'next.internal.NextRequest.init.context'
)

export type NextRequestContext = NextBaseRequestContext & {
  onClose: BaseNextResponse['onClose']
}

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
    context: Partial<NextRequestContext> | undefined
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
      context: init[NEXT_REQUEST_CONTEXT_PARAM],
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

export function getInternalNextRequestContext(request: NextRequest) {
  return request[INTERNALS].context
}

export function setInternalNextRequestContext(
  request: NextRequest,
  context: NextRequest[typeof INTERNALS]['context']
) {
  request[INTERNALS].context = context
}

export interface RequestInit extends globalThis.RequestInit {
  nextConfig?: {
    basePath?: string
    i18n?: I18NConfig | null
    trailingSlash?: boolean
  }
  signal?: AbortSignal
  /** We use a symbol for this because it's an internal thing
   * but NextRequest is user-accessible */
  [NEXT_REQUEST_CONTEXT_PARAM]?: Partial<NextRequestContext>
}
