import type { I18NConfig } from '../../config-shared'
import { NextURL } from '../next-url'
import { toNodeHeaders, validateURL } from '../utils'
import cookie from 'next/dist/compiled/cookie'
import { CookieSerializeOptions } from '../types'

const INTERNALS = Symbol('internal response')
const REDIRECTS = new Set([301, 302, 303, 307, 308])

export class NextResponse extends Response {
  [INTERNALS]: {
    cookieParser(): { [key: string]: string }
    url?: NextURL
  }

  constructor(body?: BodyInit | null, init: ResponseInit = {}) {
    super(body, init)

    const cookieParser = () => {
      const value = this.headers.get('cookie')
      return value ? cookie.parse(value) : {}
    }

    this[INTERNALS] = {
      cookieParser,
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
    return this[INTERNALS].cookieParser()
  }

  public cookie(
    name: string,
    value: { [key: string]: any } | string,
    opts: CookieSerializeOptions = {}
  ) {
    const val =
      typeof value === 'object' ? 'j:' + JSON.stringify(value) : String(value)

    const options = { ...opts }
    if (options.maxAge) {
      options.expires = new Date(Date.now() + options.maxAge)
      options.maxAge /= 1000
    }

    if (options.path == null) {
      options.path = '/'
    }

    this.headers.append(
      'Set-Cookie',
      cookie.serialize(name, String(val), options)
    )
    return this
  }

  public clearCookie(name: string, opts: CookieSerializeOptions = {}) {
    return this.cookie(name, '', { expires: new Date(1), path: '/', ...opts })
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
      headers: { Location: destination },
      status,
    })
  }

  static rewrite(destination: string | NextURL | URL) {
    return new NextResponse(null, {
      headers: {
        'x-middleware-rewrite': validateURL(destination),
      },
    })
  }

  static next() {
    return new NextResponse(null, {
      headers: {
        'x-middleware-next': '1',
      },
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
