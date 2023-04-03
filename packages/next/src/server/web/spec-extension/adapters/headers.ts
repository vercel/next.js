import type { IncomingHttpHeaders } from 'http'

function isHeaders(headers: IncomingHttpHeaders | Headers): headers is Headers {
  // TODO: maybe use instanceof check?
  return typeof headers.get === 'function' && typeof headers.set === 'function'
}

/**
 * @internal
 */
export class ReadonlyHeadersError extends Error {
  constructor() {
    super(
      'Headers cannot be modified. Read more: https://nextjs.org/docs/api-reference/headers'
    )
  }

  public static callable() {
    throw new ReadonlyHeadersError()
  }
}

export type ReadonlyHeaders = Omit<Headers, 'append' | 'delete' | 'set'>

export class HeadersAdapter extends Headers {
  constructor(private readonly headers: IncomingHttpHeaders) {
    // We've already overridden the methods that would be called, so we're just
    // calling the super constructor to ensure that the instanceof check works.
    super()
  }

  /**
   * Seals a Headers instance to prevent modification by throwing an error when
   * any mutating method is called.
   */
  public static seal(headers: Headers): ReadonlyHeaders {
    return new Proxy(headers, {
      get(target, prop) {
        switch (prop) {
          case 'append':
          case 'delete':
          case 'set':
            return ReadonlyHeadersError.callable
          default:
            return Reflect.get(target, prop)
        }
      },
    })
  }

  /**
   * Creates a Headers instance from a plain object or a Headers instance.
   *
   * @param headers a plain object or a Headers instance
   * @returns a headers instance
   */
  public static from(headers: IncomingHttpHeaders | Headers): Headers {
    if (headers instanceof HeadersAdapter) return headers
    if (isHeaders(headers)) return headers

    return new HeadersAdapter(headers)
  }

  public append(name: string, value: string): void {
    const existing = this.headers[name]
    if (typeof existing === 'string') {
      this.headers[name] = [existing, value]
    } else if (Array.isArray(existing)) {
      existing.push(value)
    }

    this.headers[name] = value
  }

  public delete(name: string): void {
    delete this.headers[name]
  }

  public get(name: string): string | null {
    const value = this.headers[name]
    if (typeof value === 'string') return value
    if (Array.isArray(value)) return value.join(', ')

    return null
  }

  public has(name: string): boolean {
    return typeof this.headers[name] !== 'undefined'
  }

  public set(name: string, value: string): void {
    this.headers[name] = value
  }

  public forEach(
    callbackfn: (value: string, key: string, parent: Headers) => void,
    thisArg?: any
  ): void {
    for (const key of Object.keys(this.headers)) {
      // We assert here that this is a string because we got it from the
      // Object.keys() call above.
      const value = this.get(key) as string

      callbackfn.call(thisArg, value, key, this)
    }
  }

  public *entries(): IterableIterator<[string, string]> {
    for (const key of Object.keys(this.headers)) {
      // We assert here that this is a string because we got it from the
      // Object.keys() call above.
      const value = this.get(key) as string

      yield [key, value] as [string, string]
    }
  }

  public *keys(): IterableIterator<string> {
    for (const key of Object.keys(this.headers)) {
      yield key
    }
  }

  public *values(): IterableIterator<string> {
    for (const key of Object.keys(this.headers)) {
      // We assert here that this is a string because we got it from the
      // Object.keys() call above.
      const value = this.get(key) as string

      yield value
    }
  }

  public [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries()
  }
}

export function getHeaderValue(
  headers: IncomingHttpHeaders | Headers,
  key: string
): string | null {
  if (isHeaders(headers)) {
    return headers.get(key)
  }

  const value = headers[key]
  if (typeof value !== 'undefined' && !Array.isArray(value)) {
    return value
  }

  return null
}

export function deleteHeader(
  headers: IncomingHttpHeaders | Headers,
  key: string
): void {
  if (isHeaders(headers)) {
    headers.delete(key)
  } else {
    delete headers[key]
  }
}
