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
export class RelativeURL extends URL {
  constructor(url: string, base?: string) {
    const resolvedBase = base ? new URL(base, DUMMY_BASE) : DUMMY_BASE
    super(
      // avoid URL parsing errors with //. WHATWG URL will try to parse this as
      // a protocol-relative url, which we don't want
      url.startsWith('/') ? resolvedBase.origin + url : url,
      resolvedBase
    )
    if (
      super.origin !== DUMMY_BASE.origin ||
      (super.protocol !== 'http:' && super.protocol !== 'https:')
    ) {
      throw new Error('invariant: invalid relative URL')
    }
  }

  get host() {
    return ''
  }

  get hostname() {
    return ''
  }

  get protocol() {
    return ''
  }

  get port() {
    return ''
  }

  get origin() {
    return ''
  }

  get href() {
    return super.href.slice(super.origin.length)
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
