import type { ParsedUrlQuery } from 'querystring'

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
