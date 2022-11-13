import type { RequestCookie } from './types'
import { parseCookieString, serialize } from './serialize'

/**
 * A class for manipulating {@link Request} cookies (`Cookie` header).
 */
export class RequestCookies {
  readonly _headers: Headers
  _parsed: Map<string, RequestCookie> = new Map()

  constructor(requestHeaders: Headers) {
    this._headers = requestHeaders
    const header = requestHeaders.get('cookie')
    if (header) {
      const parsed = parseCookieString(header)
      for (const [name, value] of parsed) {
        this._parsed.set(name, { name, value })
      }
    }
  }

  [Symbol.iterator]() {
    return this._parsed[Symbol.iterator]()
  }

  /**
   * The amount of cookies received from the client
   */
  get size(): number {
    return this._parsed.size
  }

  get(...args: [name: string] | [RequestCookie]) {
    const name = typeof args[0] === 'string' ? args[0] : args[0].name
    return this._parsed.get(name)
  }

  getAll(...args: [name: string] | [RequestCookie] | []) {
    const all = Array.from(this._parsed)
    if (!args.length) {
      return all.map(([_, value]) => value)
    }

    const name = typeof args[0] === 'string' ? args[0] : args[0]?.name
    return all.filter(([n]) => n === name).map(([_, value]) => value)
  }

  has(name: string) {
    return this._parsed.has(name)
  }

  set(...args: [key: string, value: string] | [options: RequestCookie]): this {
    const [name, value] =
      args.length === 1 ? [args[0].name, args[0].value] : args

    const map = this._parsed
    map.set(name, { name, value })

    this._headers.set(
      'cookie',
      Array.from(map)
        .map(([_, v]) => serialize(v))
        .join('; ')
    )
    return this
  }

  /**
   * Delete the cookies matching the passed name or names in the request.
   */
  delete(
    /** Name or names of the cookies to be deleted  */
    names: string | string[]
  ): boolean | boolean[] {
    const map = this._parsed
    const result = !Array.isArray(names)
      ? map.delete(names)
      : names.map((name) => map.delete(name))
    this._headers.set(
      'cookie',
      Array.from(map)
        .map(([_, value]) => serialize(value))
        .join('; ')
    )
    return result
  }

  /**
   * Delete all the cookies in the cookies in the request.
   */
  clear(): this {
    this.delete(Array.from(this._parsed.keys()))
    return this
  }

  /**
   * Format the cookies in the request as a string for logging
   */
  [Symbol.for('edge-runtime.inspect.custom')]() {
    return `RequestCookies ${JSON.stringify(Object.fromEntries(this._parsed))}`
  }
}
