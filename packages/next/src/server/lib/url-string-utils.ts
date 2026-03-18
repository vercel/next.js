/**
 * Lightweight URL string utilities that avoid `new URL()` construction.
 *
 * In hot server paths, `new URL(req.url, 'http://n')` shows up as significant
 * self-time because it must parse a full spec-compliant URL. When we only need
 * the pathname or a single query-parameter from a *relative* URL such as
 * `/path?query=1`, simple string operations are 5-10x cheaper.
 *
 * Reference: https://tanstack.com/blog/tanstack-start-5x-faster-ssr
 */

/**
 * Extract the pathname from a relative URL string (e.g. `/path?q=1` -> `/path`).
 * Returns `'/'` for empty/undefined input.
 */
export function getPathnameFromUrl(url: string | undefined): string {
  if (!url) return '/'
  const qIdx = url.indexOf('?')
  const hIdx = url.indexOf('#')
  const end =
    qIdx >= 0
      ? hIdx >= 0
        ? Math.min(qIdx, hIdx)
        : qIdx
      : hIdx >= 0
        ? hIdx
        : url.length
  return url.substring(0, end) || '/'
}

/**
 * Get the value of a single query parameter from a URL string without
 * constructing a URL or URLSearchParams object.
 *
 * Only returns the *first* occurrence. Returns `null` when the param is absent.
 * Value-less parameters (e.g. `?_rsc` without `=`) return `''`, matching
 * URLSearchParams behavior.
 */
export function getQueryParamFromUrl(
  url: string | undefined,
  param: string
): string | null {
  if (!url) return null
  const qIdx = url.indexOf('?')
  if (qIdx < 0) return null

  const search = url.substring(qIdx + 1)
  const target = param + '='

  // Walk through the search string looking for the param with a value (param=value)
  let start = 0
  while (start <= search.length) {
    const idx = search.indexOf(target, start)
    if (idx < 0) break

    // Make sure we matched at a parameter boundary (start of string or after '&')
    if (idx === 0 || search.charCodeAt(idx - 1) === 38 /* '&' */) {
      const valueStart = idx + target.length
      const ampIdx = search.indexOf('&', valueStart)
      const hashIdx = search.indexOf('#', valueStart)
      const end =
        ampIdx >= 0
          ? hashIdx >= 0
            ? Math.min(ampIdx, hashIdx)
            : ampIdx
          : hashIdx >= 0
            ? hashIdx
            : search.length
      return decodeURIComponent(search.substring(valueStart, end))
    }

    // Not at a boundary, keep searching
    start = idx + 1
  }

  // Check for value-less parameter (e.g. `?_rsc` or `?a&_rsc&b`)
  // This matches URLSearchParams behavior which returns '' for value-less params
  start = 0
  while (start <= search.length) {
    const idx = search.indexOf(param, start)
    if (idx < 0) return null

    if (idx === 0 || search.charCodeAt(idx - 1) === 38 /* '&' */) {
      const afterParam = idx + param.length
      // Must be at end of search, followed by '&', or followed by '#'
      if (
        afterParam === search.length ||
        search.charCodeAt(afterParam) === 38 /* '&' */ ||
        search.charCodeAt(afterParam) === 35 /* '#' */
      ) {
        return ''
      }
    }

    start = idx + 1
  }

  return null
}
