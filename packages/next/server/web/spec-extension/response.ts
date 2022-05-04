import type { I18NConfig } from '../../config-shared'
import { NextURL } from '../next-url'
import { toNodeHeaders, validateURL } from '../utils'

import { NextCookies } from './cookies'

const INTERNALS = Symbol('internal response')
const REDIRECTS = new Set([301, 302, 303, 307, 308])

export const RedirectHeader = 'location'
export const RewriteHeader = 'x-middleware-rewrite'
export const NextMiddlewareHeader = 'x-middleware-next'

export class NextResponse extends Response {
  [INTERNALS]: {
    cookies: NextCookies
    url?: NextURL
  }

  constructor(body?: BodyInit | null, init: ResponseInit = {}) {
    super(body, init)

    this[INTERNALS] = {
      cookies: new NextCookies(this),
      url: init.url
        ? new NextURL(init.url, {
            basePath: init.nextConfig?.basePath,
            i18n: init.nextConfig?.i18n,
            trailingSlash: init.nextConfig?.trailingSlash,
            headers: toNodeHeaders(this.headers),
          })
        : undefined,
    }
  }

  public get cookies() {
    return this[INTERNALS].cookies
  }

  static json(body: any, init?: ResponseInit) {
    const { headers, ...responseInit } = init || {}
    return new NextResponse(JSON.stringify(body), {
      ...responseInit,
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
    })
  }

  static redirect(url: string | NextURL | URL, status = 307) {
    if (!REDIRECTS.has(status)) {
      throw new RangeError(
        'Failed to execute "redirect" on "response": Invalid status code'
      )
    }

    const destination = validateURL(url)
    return new NextResponse(destination, {
      headers: { [RedirectHeader]: destination },
      status,
    })
  }

  static rewrite(destination: string | NextURL | URL) {
    return new NextResponse(null, {
      headers: { [RewriteHeader]: validateURL(destination) },
    })
  }

  static next() {
    return new NextResponse(null, {
      headers: { [NextMiddlewareHeader]: '1' },
    })
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
