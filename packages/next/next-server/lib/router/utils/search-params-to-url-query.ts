import { ParsedUrlQuery } from 'querystring'

export function searchParamsToUrlQuery(
  searchParams: URLSearchParams
): ParsedUrlQuery {
  const query: ParsedUrlQuery = {}
  Array.from(searchParams.entries()).forEach(([key, value]) => {
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
