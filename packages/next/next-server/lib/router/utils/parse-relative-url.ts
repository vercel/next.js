import { ParsedUrlQuery } from 'querystring'
import { getLocationOrigin } from '../../utils'
import { searchParamsToUrlQuery, urlQueryToSearchParams } from './querystring'

const DUMMY_BASE = new URL(
  typeof window === 'undefined' ? 'http://n' : getLocationOrigin()
)

const URL_PROPERTY = Symbol()

/**
 * Parses path-relative urls (e.g. `/hello/world?foo=bar`). If url isn't path-relative
 * (e.g. `./hello`) then at least base must be.
 * Absolute urls are rejected with one exception, in the browser, absolute urls that are on
 * the current origin will be parsed as relative
 */
export class RelativeURL {
  private readonly [URL_PROPERTY]: URL

  constructor(url: string, base?: string) {
    const resolvedBase = base ? new URL(base, DUMMY_BASE) : DUMMY_BASE
    this[URL_PROPERTY] = new URL(
      // avoid URL parsing errors with //. WHATWG URL will try to parse this as
      // a protocol-relative url, which we don't want
      url.startsWith('/') ? resolvedBase.origin + url : url,
      resolvedBase
    )
    if (
      this[URL_PROPERTY].origin !== DUMMY_BASE.origin ||
      (this[URL_PROPERTY].protocol !== 'http:' &&
        this[URL_PROPERTY].protocol !== 'https:')
    ) {
      throw new Error('invariant: invalid relative URL')
    }
  }

  get pathname() {
    return this[URL_PROPERTY].pathname
  }

  set pathname(value: string) {
    this[URL_PROPERTY].pathname = value
  }

  get search() {
    return this[URL_PROPERTY].search
  }

  set search(value: string) {
    this[URL_PROPERTY].search = value
  }

  get searchParams() {
    return this[URL_PROPERTY].searchParams
  }

  get hash() {
    return this[URL_PROPERTY].hash
  }

  set hash(value: string) {
    this[URL_PROPERTY].hash = value
  }

  get query() {
    return searchParamsToUrlQuery(this.searchParams)
  }

  set query(value: ParsedUrlQuery) {
    this[URL_PROPERTY].search = urlQueryToSearchParams(value).toString()
  }

  get href() {
    return this[URL_PROPERTY].href.slice(this[URL_PROPERTY].origin.length)
  }
}

export function parseRelativeUrl(url: string, base?: string) {
  return new RelativeURL(url, base)
}
