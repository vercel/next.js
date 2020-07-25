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
