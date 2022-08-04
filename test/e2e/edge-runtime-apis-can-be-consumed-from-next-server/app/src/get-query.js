// @ts-check

export function getQuery(keys, request) {
  const query =
    'nextUrl' in request
      ? Object.fromEntries(request.nextUrl.searchParams)
      : request.query
  const result = {}
  for (const key of keys) {
    const value = query[key]
    if (!value) {
      throw new Error(`Missing query parameter: ${key}`)
    }
    result[key] = String(query[key])
  }
  return result
}
