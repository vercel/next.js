import { Body, BodyInit, cloneBody, extractContentType } from './body'
import { NextURL } from '../next-url'

const INTERNALS = Symbol('internal response')
const REDIRECTS = new Set([301, 302, 303, 307, 308])

class BaseResponse extends Body implements Response {
  [INTERNALS]: {
    headers: Headers
    status: number
    statusText: string
    type: 'default' | 'error'
    url?: NextURL
  }

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    super(body)

    this[INTERNALS] = {
      headers: new Headers(init?.headers),
      status: init?.status || 200,
      statusText: init?.statusText || '',
      type: 'default',
      url: init?.url ? new NextURL(init.url) : undefined,
    }

    if (this[INTERNALS].status < 200 || this[INTERNALS].status > 599) {
      throw new RangeError(
        `Responses may only be constructed with status codes in the range 200 to 599, inclusive.`
      )
    }

    if (body !== null && !this[INTERNALS].headers.has('Content-Type')) {
      const contentType = extractContentType(this)
      if (contentType) {
        this[INTERNALS].headers.append('Content-Type', contentType)
      }
    }
  }

  static redirect(url: string, status = 302) {
    if (!REDIRECTS.has(status)) {
      throw new RangeError(
        'Failed to execute "redirect" on "response": Invalid status code'
      )
    }

    return new Response(null, {
      headers: { Location: url },
      status,
    })
  }

  static error() {
    const response = new BaseResponse(null, { status: 0, statusText: '' })
    response[INTERNALS].type = 'error'
    return response
  }

  get url() {
    return this[INTERNALS].url?.toString() || ''
  }

  get ok() {
    return this[INTERNALS].status >= 200 && this[INTERNALS].status < 300
  }

  get status() {
    return this[INTERNALS].status
  }

  get statusText() {
    return this[INTERNALS].statusText
  }

  get headers() {
    return this[INTERNALS].headers
  }

  get redirected() {
    return (
      this[INTERNALS].status > 299 &&
      this[INTERNALS].status < 400 &&
      this[INTERNALS].headers.has('Location')
    )
  }

  get type() {
    return this[INTERNALS].type
  }

  clone() {
    return new BaseResponse(cloneBody(this), {
      headers: this.headers,
      status: this.status,
      statusText: this.statusText,
      url: this.url,
    })
  }

  get [Symbol.toStringTag]() {
    return 'Response'
  }
}

export interface ResponseInit {
  headers?: HeadersInit
  status?: number
  statusText?: string
  url?: string
}

export { BaseResponse as Response }
