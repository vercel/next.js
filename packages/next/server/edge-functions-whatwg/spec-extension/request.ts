import type { I18NConfig } from '../../config-shared'
import type { Klass } from '../types'
import { NextURL } from '../next-url'
import { toNodeHeaders } from '../utils'
import cookie from 'next/dist/compiled/cookie'

declare global {
  var WhatWGRequest: Klass<globalThis.Request>
}

export const INTERNALS = Symbol('internal request')

export class Request extends WhatWGRequest {
  [INTERNALS]: {
    cookieParser(): { [key: string]: string }
    page?: { name?: string; params?: { [key: string]: string } }
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

  public get next() {
    return {
      url: this[INTERNALS].url,
      page: {
        name: this[INTERNALS].page?.name,
        params: this[INTERNALS].page?.params,
      },
    }
  }

  public get url() {
    return this[INTERNALS].url.toString()
  }
}

interface RequestInit extends globalThis.RequestInit {
  nextConfig?: {
    basePath?: string
    i18n?: I18NConfig | null
    trailingSlash?: boolean
  }
  page?: {
    name?: string
    params?: { [key: string]: string }
  }
}
