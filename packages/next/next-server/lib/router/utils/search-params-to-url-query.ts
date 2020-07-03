import { ParsedUrlQuery } from 'querystring'

export default function searchParamsToUrlQuery(
  searchParams: URLSearchParams
): ParsedUrlQuery {
  const query: ParsedUrlQuery = {}
  for (const [key, value] of searchParams.entries()) {
    if (typeof query[key] === 'undefined') {
      query[key] = value
    } else if (Array.isArray(query[key])) {
      ;(query[key] as string[]).push(value)
    } else {
      query[key] = [query[key] as string, value]
    }
  }
  return query
}
