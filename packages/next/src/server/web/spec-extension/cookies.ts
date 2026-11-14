import {
  RequestCookies as EdgeRequestCookies,
  ResponseCookies as EdgeResponseCookies,
  stringifyCookie,
  parseSetCookie,
} from 'next/dist/compiled/@edge-runtime/cookies'
import { splitCookiesString } from '../utils'

export { stringifyCookie }

type RequestCookie = { name: string; value: string }
type ResponseCookie = RequestCookie & {
  expires?: Date | number
  maxAge?: number
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
  priority?: 'low' | 'medium' | 'high'
  partitioned?: boolean
}

export class RequestCookies extends EdgeRequestCookies {
  public _parsed: Map<string, RequestCookie[]> = new Map()
  private _headers: Headers

  constructor(requestHeaders: Headers) {
    super(requestHeaders)
    this._headers = requestHeaders
    this._parsed = new Map()

    const header = requestHeaders.get('cookie')
    if (header) {
      for (const pair of header.split(/; */)) {
        if (!pair) continue
        const splitAt = pair.indexOf('=')
        let key, value
        if (splitAt === -1) {
          key = pair
          value = 'true'
        } else {
          key = pair.slice(0, splitAt)
          value = pair.slice(splitAt + 1)
        }
        try {
          value = decodeURIComponent(value ?? 'true')
        } catch {}

        let arr = this._parsed.get(key)
        if (!arr) {
          arr = []
          this._parsed.set(key, arr)
        }
        arr.push({ name: key, value })
      }
    }
  }

  [Symbol.iterator]() {
    const all = Array.from(this._parsed.values()).flat()
    const mapped = all.map((c) => [c.name, c] as [string, RequestCookie])
    return mapped[Symbol.iterator]()
  }

  get size() {
    return Array.from(this._parsed.values()).reduce(
      (acc, arr) => acc + arr.length,
      0
    )
  }

  get(...args: any[]) {
    const name = typeof args[0] === 'string' ? args[0] : args[0]?.name
    const arr = this._parsed.get(name)
    return arr?.[0]
  }

  getAll(...args: any[]) {
    const all = Array.from(this._parsed.values()).flat()
    if (!args.length) {
      return all
    }
    const name = typeof args[0] === 'string' ? args[0] : args[0]?.name
    return all.filter((c) => c.name === name)
  }

  has(name: string) {
    return this._parsed.has(name)
  }

  set(...args: any[]) {
    const [name, value] =
      args.length === 1 ? [args[0].name, args[0].value] : args
    this._parsed.set(name, [{ name, value }])
    this._updateHeaders()
    return this
  }

  delete(names: string | string[]) {
    const namesArray = Array.isArray(names) ? names : [names]
    let deleted = false
    for (const name of namesArray) {
      const cookieName = typeof name === 'string' ? name : (name as any).name
      if (this._parsed.delete(cookieName)) {
        deleted = true
      }
    }
    this._updateHeaders()
    return deleted
  }

  clear() {
    this._parsed.clear()
    this._updateHeaders()
    return this
  }

  private _updateHeaders() {
    const all = Array.from(this._parsed.values()).flat()
    if (all.length === 0) {
      this._headers.delete('cookie')
    } else {
      this._headers.set(
        'cookie',
        all.map((c) => stringifyCookie(c as any)).join('; ')
      )
    }
  }

  [Symbol.for('edge-runtime.inspect.custom')]() {
    return `RequestCookies ${JSON.stringify(Object.fromEntries(this._parsed))}`
  }

  toString() {
    return Array.from(this._parsed.values())
      .flat()
      .map((v) => `${v.name}=${encodeURIComponent(v.value)}`)
      .join('; ')
  }
}

export class ResponseCookies extends EdgeResponseCookies {
  public _parsed: Map<string, ResponseCookie[]> = new Map()
  private _headers: Headers

  constructor(responseHeaders: Headers) {
    super(responseHeaders)
    this._headers = responseHeaders
    this._parsed = new Map()

    const setCookie =
      responseHeaders.getSetCookie?.() ||
      responseHeaders.get('set-cookie') ||
      []
    const cookieStrings = Array.isArray(setCookie)
      ? setCookie
      : splitCookiesString(setCookie)
    for (const cookieString of cookieStrings) {
      const parsed = parseSetCookie(cookieString)
      if (parsed) {
        let arr = this._parsed.get(parsed.name)
        if (!arr) {
          arr = []
          this._parsed.set(parsed.name, arr)
        }
        arr.push(parsed as ResponseCookie)
      }
    }
  }

  [Symbol.iterator]() {
    const all = Array.from(this._parsed.values()).flat()
    const mapped = all.map((c) => [c.name, c] as [string, ResponseCookie])
    return mapped[Symbol.iterator]()
  }

  get size() {
    return Array.from(this._parsed.values()).reduce(
      (acc, arr) => acc + arr.length,
      0
    )
  }

  get(...args: any[]) {
    const name = typeof args[0] === 'string' ? args[0] : args[0]?.name
    const arr = this._parsed.get(name)
    return arr?.[0]
  }

  getAll(...args: any[]) {
    const all = Array.from(this._parsed.values()).flat()
    if (!args.length) {
      return all
    }
    const name = typeof args[0] === 'string' ? args[0] : args[0]?.name
    return all.filter((c) => c.name === name)
  }

  has(name: string) {
    return this._parsed.has(name)
  }

  set(...args: any[]) {
    const [name, value, cookie] =
      args.length === 1 ? [args[0].name, args[0].value, args[0]] : args

    const parsedCookie = normalizeCookie({ name, value, ...cookie })

    // A Set-Cookie is uniquely identified by its (name, path, domain) tuple, so
    // multiple cookies can share the same name as long as their path/domain
    // differ. Only replace an existing cookie that matches the same
    // path/domain, otherwise append so duplicates are preserved.
    const existing = this._parsed.get(name)
    if (!existing) {
      this._parsed.set(name, [parsedCookie])
    } else {
      const index = existing.findIndex(
        (c) =>
          (c.path ?? '/') === (parsedCookie.path ?? '/') &&
          (c.domain ?? undefined) === (parsedCookie.domain ?? undefined)
      )
      if (index === -1) {
        existing.push(parsedCookie)
      } else {
        existing[index] = parsedCookie
      }
    }
    this._updateHeaders()
    return this
  }

  delete(...args: any[]) {
    const [name, options] =
      typeof args[0] === 'string' ? [args[0]] : [args[0].name, args[0]]
    return this.set({ ...options, name, value: '', expires: new Date(0) })
  }

  private _updateHeaders() {
    this._headers.delete('set-cookie')
    const all = Array.from(this._parsed.values()).flat()
    for (const cookie of all) {
      this._headers.append('set-cookie', stringifyCookie(cookie as any))
    }
  }

  [Symbol.for('edge-runtime.inspect.custom')]() {
    return `ResponseCookies ${JSON.stringify(Object.fromEntries(this._parsed))}`
  }

  toString() {
    return Array.from(this._parsed.values())
      .flat()
      .map((c) => stringifyCookie(c as any))
      .join('; ')
  }
}

function normalizeCookie(cookie: any) {
  if (typeof cookie.expires === 'number') {
    cookie.expires = new Date(cookie.expires)
  }
  if (cookie.maxAge) {
    cookie.expires = new Date(Date.now() + cookie.maxAge * 1000)
  }
  if (cookie.path === null || cookie.path === undefined) {
    cookie.path = '/'
  }
  return cookie
}
