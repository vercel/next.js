import type { ParsedUrlQuery } from 'querystring'

export function getRenderedSearch(query: ParsedUrlQuery): string {
  // Inlined implementation of querystring.encode, which is not available in
  // the Edge runtime.
  const pairs = []
  for (const key in query) {
    const value = query[key]
    if (value == null) continue
    if (Array.isArray(value)) {
      for (const v of value) {
        pairs.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`
        )
      }
    } else {
      pairs.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      )
    }
  }

  // The result should match the format of a web URL's `search` property, since
  // this is the format that's stored in the App Router state.
  // TODO: We're a bit inconsistent about this. The x-nextjs-rewritten-query
  // header omits the leading question mark. Should refactor to always do
  // that instead.
  if (pairs.length === 0) {
    // If the search string is empty, return an empty string.
    return ''
  }
  // Prepend '?' to the search params string.
  return '?' + pairs.join('&')
}

export function searchParamsToUrlQuery(
  searchParams: URLSearchParams
): ParsedUrlQuery {
  const query: ParsedUrlQuery = {}
  for (const [key, value] of searchParams.entries()) {
    const existing = query[key]
    if (typeof existing === 'undefined') {
      query[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      query[key] = [existing, value]
    }
  }
  return query
}

function stringifyUrlQueryParam(param: unknown): string {
  if (typeof param === 'string') {
    return param
  }

  if (
    (typeof param === 'number' && !isNaN(param)) ||
    typeof param === 'boolean'
  ) {
    return String(param)
  } else {
    return ''
  }
}

export function urlQueryToSearchParams(query: ParsedUrlQuery): URLSearchParams {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, stringifyUrlQueryParam(item))
      }
    } else {
      searchParams.set(key, stringifyUrlQueryParam(value))
    }
  }
  return searchParams
}

export function assign(
  target: URLSearchParams,
  ...searchParamsList: URLSearchParams[]
): URLSearchParams {
  for (const searchParams of searchParamsList) {
    for (const key of searchParams.keys()) {
      target.delete(key)
    }

    for (const [key, value] of searchParams.entries()) {
      target.append(key, value)
    }
  }

  return target
}
