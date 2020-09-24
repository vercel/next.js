import { getLocationOrigin } from '../../utils'
import { searchParamsToUrlQuery } from './querystring'

const DUMMY_BASE = new URL(
  typeof window === 'undefined' ? 'http://n' : getLocationOrigin()
)

/**
 * Parses path-relative urls (e.g. `/hello/world?foo=bar`). If url isn't path-relative
 * (e.g. `./hello`) then at least base must be.
 * Absolute urls are rejected with one exception, in the browser, absolute urls that are on
 * the current origin will be parsed as relative
 */
export class RelativeURL {
  private readonly _u: URL

  constructor(url: string, base?: string) {
    const resolvedBase = base ? new URL(base, DUMMY_BASE) : DUMMY_BASE
    this._u = new URL(
      // avoid URL parsing errors with //. WHATWG URL will try to parse this as
      // a protocol-relative url, which we don't want
      url.startsWith('/') ? resolvedBase.origin + url : url,
      resolvedBase
    )
    if (
      this._u.origin !== DUMMY_BASE.origin ||
      (this._u.protocol !== 'http:' && this._u.protocol !== 'https:')
    ) {
      throw new Error('invariant: invalid relative URL')
    }
  }

  get pathname() {
    return this._u.pathname
  }

  set pathname(value: string) {
    this._u.pathname = value
  }

  get search() {
    return this._u.search
  }

  set search(value: string) {
    this._u.search = value
  }

  get searchParams() {
    return this._u.searchParams
  }

  get hash() {
    return this._u.hash
  }

  set hash(value: string) {
    this._u.hash = value
  }

  get href() {
    return this._u.href.slice(this._u.origin.length)
  }
}

export function parseRelativeUrl(url: string, base?: string) {
  const { pathname, searchParams, search, hash, href } = new RelativeURL(
    url,
    base
  )
  return {
    pathname,
    query: searchParamsToUrlQuery(searchParams),
    search,
    hash,
    href,
  }
}
