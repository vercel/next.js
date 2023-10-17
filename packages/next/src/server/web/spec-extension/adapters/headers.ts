import type { IncomingHttpHeaders } from 'http'

import { ReflectAdapter } from './reflect'

/**
 * @internal
 */
export class ReadonlyHeadersError extends Error {
  constructor() {
    super(
      'Headers cannot be modified. Read more: https://nextjs.org/docs/app/api-reference/functions/headers'
    )
  }

  public static callable() {
    throw new ReadonlyHeadersError()
  }
}

export type ReadonlyHeaders = Headers & {
  /** @deprecated Method unavailable on `ReadonlyHeaders`. Read more: https://nextjs.org/docs/app/api-reference/functions/headers */
  append(...args: any[]): void
  /** @deprecated Method unavailable on `ReadonlyHeaders`. Read more: https://nextjs.org/docs/app/api-reference/functions/headers */
  set(...args: any[]): void
  /** @deprecated Method unavailable on `ReadonlyHeaders`. Read more: https://nextjs.org/docs/app/api-reference/functions/headers */
  delete(...args: any[]): void
}
export class HeadersAdapter extends Headers {
  private readonly headers: IncomingHttpHeaders

  constructor(headers: IncomingHttpHeaders) {
    // We've already overridden the methods that would be called, so we're just
    // calling the super constructor to ensure that the instanceof check works.
    super()

    this.headers = new Proxy(headers, {
      get(target, prop, receiver) {
        // Because this is just an object, we expect that all "get" operations
        // are for properties. If it's a "get" for a symbol, we'll just return
        // the symbol.
        if (typeof prop === 'symbol') {
          return ReflectAdapter.get(target, prop, receiver)
        }

        const lowercased = prop.toLowerCase()

        // Let's find the original casing of the key. This assumes that there is
        // no mixed case keys (e.g. "Content-Type" and "content-type") in the
        // headers object.
        const original = Object.keys(headers).find(
          (o) => o.toLowerCase() === lowercased
        )

        // If the original casing doesn't exist, return undefined.
        if (typeof original === 'undefined') return

        // If the original casing exists, return the value.
        return ReflectAdapter.get(target, original, receiver)
      },
      set(target, prop, value, receiver) {
        if (typeof prop === 'symbol') {
          return ReflectAdapter.set(target, prop, value, receiver)
        }

        const lowercased = prop.toLowerCase()

        // Let's find the original casing of the key. This assumes that there is
        // no mixed case keys (e.g. "Content-Type" and "content-type") in the
        // headers object.
        const original = Object.keys(headers).find(
          (o) => o.toLowerCase() === lowercased
        )

        // If the original casing doesn't exist, use the prop as the key.
        return ReflectAdapter.set(target, original ?? prop, value, receiver)
      },
      has(target, prop) {
        if (typeof prop === 'symbol') return ReflectAdapter.has(target, prop)

        const lowercased = prop.toLowerCase()

        // Let's find the original casing of the key. This assumes that there is
        // no mixed case keys (e.g. "Content-Type" and "content-type") in the
        // headers object.
        const original = Object.keys(headers).find(
          (o) => o.toLowerCase() === lowercased
        )

        // If the original casing doesn't exist, return false.
        if (typeof original === 'undefined') return false

        // If the original casing exists, return true.
        return ReflectAdapter.has(target, original)
      },
      deleteProperty(target, prop) {
        if (typeof prop === 'symbol')
          return ReflectAdapter.deleteProperty(target, prop)

        const lowercased = prop.toLowerCase()

        // Let's find the original casing of the key. This assumes that there is
        // no mixed case keys (e.g. "Content-Type" and "content-type") in the
        // headers object.
        const original = Object.keys(headers).find(
          (o) => o.toLowerCase() === lowercased
        )

        // If the original casing doesn't exist, return true.
        if (typeof original === 'undefined') return true

        // If the original casing exists, delete the property.
        return ReflectAdapter.deleteProperty(target, original)
      },
    })
  }

  /**
   * Seals a Headers instance to prevent modification by throwing an error when
   * any mutating method is called.
   */
  public static seal(headers: Headers): ReadonlyHeaders {
    return new Proxy<ReadonlyHeaders>(headers, {
      get(target, prop, receiver) {
        switch (prop) {
          case 'append':
          case 'delete':
          case 'set':
            return ReadonlyHeadersError.callable
          default:
            return ReflectAdapter.get(target, prop, receiver)
        }
      },
    })
  }

  /**
   * Merges a header value into a string. This stores multiple values as an
   * array, so we need to merge them into a string.
   *
   * @param value a header value
   * @returns a merged header value (a string)
   */
  private merge(value: string | string[]): string {
    if (Array.isArray(value)) return value.join(', ')

    return value
  }

  /**
   * Creates a Headers instance from a plain object or a Headers instance.
   *
   * @param headers a plain object or a Headers instance
   * @returns a headers instance
   */
  public static from(headers: IncomingHttpHeaders | Headers): Headers {
    if (headers instanceof Headers) return headers

    return new HeadersAdapter(headers)
  }

  public append(name: string, value: string): void {
    const existing = this.headers[name]
    if (typeof existing === 'string') {
      this.headers[name] = [existing, value]
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      this.headers[name] = value
    }
  }

  public delete(name: string): void {
    delete this.headers[name]
  }

  public get(name: string): string | null {
    const value = this.headers[name]
    if (typeof value !== 'undefined') return this.merge(value)

    return null
  }

  public has(name: string): boolean {
    return typeof this.headers[name] !== 'undefined'
  }

  public set(name: string, value: string): void {
    this.headers[name] = value
  }

  public forEach(
    callbackfn: (value: string, name: string, parent: Headers) => void,
    thisArg?: any
  ): void {
    for (const [name, value] of this.entries()) {
      callbackfn.call(thisArg, value, name, this)
    }
  }

  public *entries(): IterableIterator<[string, string]> {
    for (const key of Object.keys(this.headers)) {
      const name = key.toLowerCase()
      // We assert here that this is a string because we got it from the
      // Object.keys() call above.
      const value = this.get(name) as string

      yield [name, value] as [string, string]
    }
  }

  public *keys(): IterableIterator<string> {
    for (const key of Object.keys(this.headers)) {
      const name = key.toLowerCase()
      yield name
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
