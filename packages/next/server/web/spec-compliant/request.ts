import { Body, cloneBody, extractContentType, getInstanceBody } from './body'
import { Headers as BaseHeaders } from './headers'
import { NextURL } from '../next-url'
import { notImplemented } from '../utils'

export const INTERNALS = Symbol('internal request')

class BaseRequest extends Body implements Request {
  [INTERNALS]: {
    credentials: RequestCredentials
    headers: Headers
    method: string
    redirect: RequestRedirect
    url: NextURL
  }

  constructor(input: BaseRequest | string, init: RequestInit = {}) {
    const method = init.method?.toUpperCase() ?? 'GET'

    if (
      (method === 'GET' || method === 'HEAD') &&
      (init.body || (input instanceof BaseRequest && getInstanceBody(input)))
    ) {
      throw new TypeError('Request with GET/HEAD method cannot have body')
    }

    let inputBody: BodyInit | null = null
    if (init.body) {
      inputBody = init.body
    } else if (input instanceof BaseRequest && getInstanceBody(input)) {
      inputBody = cloneBody(input)
    }

    super(inputBody)

    const headers = new BaseHeaders(
      init.headers || getProp(input, 'headers') || {}
    )
    if (inputBody !== null) {
      const contentType = extractContentType(this)
      if (contentType !== null && !headers.has('Content-Type')) {
        headers.append('Content-Type', contentType)
      }
    }

    this[INTERNALS] = {
      credentials:
        init.credentials || getProp(input, 'credentials') || 'same-origin',
      headers,
      method,
      redirect: init.redirect || getProp(input, 'redirect') || 'follow',
      url: new NextURL(typeof input === 'string' ? input : input.url),
    }
  }

  get url() {
    return this[INTERNALS].url.toString()
  }

  get credentials() {
    return this[INTERNALS].credentials
  }

  get method() {
    return this[INTERNALS].method
  }

  get headers() {
    return this[INTERNALS].headers
  }

  get redirect() {
    return this[INTERNALS].redirect
  }

  public clone() {
    return new BaseRequest(this)
  }

  get cache() {
    return notImplemented('Request', 'cache')
  }

  get integrity() {
    return notImplemented('Request', 'integrity')
  }

  get keepalive() {
    return notImplemented('Request', 'keepalive')
  }

  get mode() {
    return notImplemented('Request', 'mode')
  }

  get destination() {
    return notImplemented('Request', 'destination')
  }

  get referrer() {
    return notImplemented('Request', 'referrer')
  }

  get referrerPolicy() {
    return notImplemented('Request', 'referrerPolicy')
  }

  get signal() {
    return notImplemented('Request', 'signal')
  }

  get [Symbol.toStringTag]() {
    return 'Request'
  }
}

export { BaseRequest as Request }

function getProp<K extends keyof BaseRequest>(
  input: BaseRequest | string,
  key: K
): BaseRequest[K] | undefined {
  return input instanceof BaseRequest ? input[key] : undefined
}
