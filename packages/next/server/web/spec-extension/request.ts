import type { I18NConfig } from '../../config-shared'
import type { RequestData } from '../types'
import { NextURL } from '../next-url'
import { isBot } from '../../utils'
import { toNodeHeaders, validateURL } from '../utils'
import parseua from 'next/dist/compiled/ua-parser-js'
import { DeprecationPageError } from '../error'

import { NextCookies } from './cookies'

export const INTERNALS = Symbol('internal request')

export class NextRequest extends Request {
  [INTERNALS]: {
    cookies: NextCookies
    geo: RequestData['geo']
    ip?: string
    ua?: UserAgent | null
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

  public get page() {
    throw new DeprecationPageError()
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
