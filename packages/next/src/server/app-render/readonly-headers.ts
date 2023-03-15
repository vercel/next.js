import type { IncomingHttpHeaders } from 'http'

const INTERNAL_HEADERS_INSTANCE = Symbol('internal for headers readonly')

function readonlyHeadersError() {
  return new Error('ReadonlyHeaders cannot be modified')
}

export class ReadonlyHeaders {
  [INTERNAL_HEADERS_INSTANCE]: Headers

  entries: Headers['entries']
  forEach: Headers['forEach']
  get: Headers['get']
  has: Headers['has']
  keys: Headers['keys']
  values: Headers['values']

  constructor(headers: IncomingHttpHeaders) {
    // Since `new Headers` uses `this.append()` to fill the headers object ReadonlyHeaders can't extend from Headers directly as it would throw.
    const headersInstance = new Headers(headers as any)
    this[INTERNAL_HEADERS_INSTANCE] = headersInstance

    this.entries = headersInstance.entries.bind(headersInstance)
    this.forEach = headersInstance.forEach.bind(headersInstance)
    this.get = headersInstance.get.bind(headersInstance)
    this.has = headersInstance.has.bind(headersInstance)
    this.keys = headersInstance.keys.bind(headersInstance)
    this.values = headersInstance.values.bind(headersInstance)
  }
  [Symbol.iterator]() {
    return this[INTERNAL_HEADERS_INSTANCE][Symbol.iterator]()
  }

  append() {
    throw readonlyHeadersError()
  }
  delete() {
    throw readonlyHeadersError()
  }
  set() {
    throw readonlyHeadersError()
  }
}
