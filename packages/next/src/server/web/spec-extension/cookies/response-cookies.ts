import type { ResponseCookie } from './types'
import { parseSetCookieString, serialize } from './serialize'

function replace(bag: Map<string, ResponseCookie>, headers: Headers) {
  headers.delete('set-cookie')
  for (const [, value] of bag) {
    const serialized = serialize(value)
    headers.append('set-cookie', serialized)
  }
}

function normalizeCookie(cookie: ResponseCookie = { name: '', value: '' }) {
  if (cookie.maxAge) {
    cookie.expires = new Date(Date.now() + cookie.maxAge * 1000)
  }

  if (cookie.path === null || cookie.path === undefined) {
    cookie.path = '/'
  }

  return cookie
}

/**
 * A class for manipulating {@link Response} cookies (`Set-Cookie` header).
 * Loose implementation of the experimental [Cookie Store API](https://wicg.github.io/cookie-store/#dictdef-cookie)
 * The main difference is `ResponseCookies` methods do not return a Promise.
 */
export class ResponseCookies {
  readonly _headers: Headers
  _parsed: Map<string, ResponseCookie> = new Map()

  constructor(responseHeaders: Headers) {
    this._headers = responseHeaders
    // @ts-expect-error See https://github.com/whatwg/fetch/issues/973
    const headers = this._headers.getAll('set-cookie')

    for (const header of headers) {
      const parsed = parseSetCookieString(header)
      if (parsed) {
        this._parsed.set(parsed.name, parsed)
      }
    }
  }

  /**
   * {@link https://wicg.github.io/cookie-store/#CookieStore-get CookieStore#get} without the Promise.
   */
  get(
    ...args: [key: string] | [options: ResponseCookie]
  ): ResponseCookie | undefined {
    const key = typeof args[0] === 'string' ? args[0] : args[0].name
    return this._parsed.get(key)
  }
  /**
   * {@link https://wicg.github.io/cookie-store/#CookieStore-getAll CookieStore#getAll} without the Promise.
   */
  getAll(
    ...args: [key: string] | [options: ResponseCookie] | []
  ): ResponseCookie[] {
    const all = Array.from(this._parsed.values())
    if (!args.length) {
      return all
    }

    const key = typeof args[0] === 'string' ? args[0] : args[0]?.name
    return all.filter((c) => c.name === key)
  }

  /**
   * {@link https://wicg.github.io/cookie-store/#CookieStore-set CookieStore#set} without the Promise.
   */
  set(
    ...args:
      | [key: string, value: string, cookie?: Partial<ResponseCookie>]
      | [options: ResponseCookie]
  ): this {
    const [name, value, cookie] =
      args.length === 1 ? [args[0].name, args[0].value, args[0]] : args
    const map = this._parsed
    map.set(name, normalizeCookie({ name, value, ...cookie }))
    replace(map, this._headers)

    return this
  }

  /**
   * {@link https://wicg.github.io/cookie-store/#CookieStore-delete CookieStore#delete} without the Promise.
   */
  delete(...args: [key: string] | [options: ResponseCookie]): this {
    const name = typeof args[0] === 'string' ? args[0] : args[0].name
    return this.set({ name, value: '', expires: new Date(0) })
  }

  [Symbol.for('edge-runtime.inspect.custom')]() {
    return `ResponseCookies ${JSON.stringify(Object.fromEntries(this._parsed))}`
  }
}
