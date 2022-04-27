import type { I18NConfig } from '../../config-shared'
import type { RequestData } from '../types'
import { NextURL } from '../next-url'
import { isBot } from '../../utils'
import { toNodeHeaders } from '../utils'
import cookie from 'next/dist/compiled/cookie'
import parseua from 'next/dist/compiled/ua-parser-js'

export const INTERNALS = Symbol('internal request')

export class NextRequest extends Request {
  [INTERNALS]: {
    cookieParser(): { [key: string]: string }
    geo: RequestData['geo']
    ip?: string
    page?: { name?: string; params?: { [key: string]: string | string[] } }
    ua?: UserAgent | null
    url: NextURL
  }

  constructor(input: Request | string, init: RequestInit = {}) {
    super(input, init)

    const cookieParser = () => {
      const value = this.headers.get('cookie')
      return value ? cookie.parse(value) : {}
    }

    this[INTERNALS] = {
      cookieParser,
      geo: init.geo || {},
      ip: init.ip,
      page: init.page,
      url: new NextURL(typeof input === 'string' ? input : input.url, {
        basePath: init.nextConfig?.basePath,
        headers: toNodeHeaders(this.headers),
        i18n: init.nextConfig?.i18n,
        trailingSlash: init.nextConfig?.trailingSlash,
      }),
    }
  }

  public get cookies() {
    return this[INTERNALS].cookieParser()
  }

  public get geo() {
    return this[INTERNALS].geo
  }

  public get ip() {
    return this[INTERNALS].ip
  }

  public get preflight() {
    return this.headers.get('x-middleware-preflight')
  }

  public get nextUrl() {
    return this[INTERNALS].url
  }

  public get page() {
    return {
      name: this[INTERNALS].page?.name,
      params: this[INTERNALS].page?.params,
    }
  }

  public get ua() {
    if (typeof this[INTERNALS].ua !== 'undefined') {
      return this[INTERNALS].ua || undefined
    }

    const uaString = this.headers.get('user-agent')
    if (!uaString) {
      this[INTERNALS].ua = null
      return this[INTERNALS].ua || undefined
    }

    this[INTERNALS].ua = {
      ...parseua(uaString),
      isBot: isBot(uaString),
    }

    return this[INTERNALS].ua
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
  page?: {
    name?: string
    params?: { [key: string]: string | string[] }
  }
}

interface UserAgent {
  isBot: boolean
  ua: string
  browser: {
    name?: string
    version?: string
  }
  device: {
    model?: string
    type?: string
    vendor?: string
  }
  engine: {
    name?: string
    version?: string
  }
  os: {
    name?: string
    version?: string
  }
  cpu: {
    architecture?: string
  }
}
