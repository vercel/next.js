import { ParsedUrlQuery } from 'querystring'

export function searchParamsToUrlQuery(
  searchParams: URLSearchParams
): ParsedUrlQuery {
  const query: ParsedUrlQuery = {}
  searchParams.forEach((value, key) => {
    if (typeof query[key] === 'undefined') {
      query[key] = value
    } else if (Array.isArray(query[key])) {
      ;(query[key] as string[]).push(value)
    } else {
      query[key] = [query[key] as string, value]
    }
  })
  return query
}

export function urlQueryToSearchParams(
  urlQuery: ParsedUrlQuery
): URLSearchParams {
  const result = new URLSearchParams()
  Object.entries(urlQuery).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => result.append(key, item))
    } else {
      result.set(key, value)
    }
  })
  return result
}

export function assign(
  target: URLSearchParams,
  ...searchParamsList: URLSearchParams[]
): URLSearchParams {
  searchParamsList.forEach((searchParams) => {
    Array.from(searchParams.keys()).forEach((key) => target.delete(key))
    searchParams.forEach((value, key) => target.append(key, value))
  })
  return target
}
