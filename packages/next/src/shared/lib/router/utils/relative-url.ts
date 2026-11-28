/**
 * A native WHATWG URL whose origin is an implementation detail. Request paths
 * must never use that origin for routing, redirects, or outgoing requests.
 * Use the explicit formatting/conversion functions below at those boundaries.
 */
declare const relativeURLBrand: unique symbol

export type RelativeURL = Pick<
  URL,
  'pathname' | 'search' | 'searchParams' | 'hash'
> & {
  readonly [relativeURLBrand]: true
  readonly toString: never
  readonly toJSON: never
}

const RELATIVE_ORIGIN = 'http://n'

/** Parse an origin-form request target, including paths starting with `//`. */
export function parseRequestPath(path: string): RelativeURL {
  if (!path.startsWith('/')) {
    throw new TypeError(`Expected a request path, received ${path}`)
  }
  // Supplying a base to new URL(path, base) would interpret // as an authority.
  return new URL(RELATIVE_ORIGIN + path) as URL & RelativeURL
}

/** Accept an absolute request URL at an ingress boundary, discarding its origin. */
export function tryParseRequestURL(input: string): RelativeURL | undefined {
  try {
    if (input.startsWith('/')) return parseRequestPath(input)
    const url = new URL(input, RELATIVE_ORIGIN)
    return parseRequestPath(url.pathname + url.search + url.hash)
  } catch {
    return undefined
  }
}

export function formatRelativeURL(url: RelativeURL): string {
  // Invoke the native stringifier only inside this module.
  // Slicing href also preserves a trailing empty query or fragment delimiter.
  return URL.prototype.toString.call(url).slice(RELATIVE_ORIGIN.length)
}

export function cloneRelativeURL(url: RelativeURL): RelativeURL {
  return parseRequestPath(formatRelativeURL(url))
}

export function toAbsoluteURL(url: RelativeURL, origin: URL): URL {
  // Concatenation preserves a leading // as part of the path here, too.
  return new URL(origin.origin + formatRelativeURL(url))
}
