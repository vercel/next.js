import type { I18NConfig } from '../../config-shared'
import type { CookieSerializeOptions } from 'next/dist/compiled/cookie'
import { NextURL } from '../next-url'
import { toNodeHeaders } from '../utils'
import cookie from 'next/dist/compiled/cookie'

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

    if (opts.maxAge) {
      opts.expires = new Date(Date.now() + opts.maxAge)
      opts.maxAge /= 1000
    }

    if (opts.path == null) {
      opts.path = '/'
    }

    this.headers.append('Set-Cookie', cookie.serialize(name, String(val), opts))
    return this
  }

  public clearCookie(name: string, opts: CookieSerializeOptions = {}) {
    return this.cookie(name, '', { expires: new Date(1), path: '/', ...opts })
  }

  static redirect(url: string | NextURL, status = 302) {
    if (!REDIRECTS.has(status)) {
      throw new RangeError(
        'Failed to execute "redirect" on "response": Invalid status code'
      )
    }

    return new NextResponse(null, {
      headers: { Location: typeof url === 'string' ? url : url.toString() },
      status,
    })
  }

  static rewrite(destination: string | NextURL) {
    return new NextResponse(null, {
      headers: {
        'x-middleware-rewrite':
          typeof destination === 'string'
            ? destination
            : destination.toString(),
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
