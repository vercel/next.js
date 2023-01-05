const KEY = 'x-request-meta'

export function withRequestMeta(
  meta: Record<string, any>,
  headers: HeadersInit = {}
): HeadersInit {
  return {
    ...headers,
    [KEY]: JSON.stringify(meta),
  }
}

export function getRequestMeta(headers: Headers): Record<string, any> | null {
  const header = headers.get(KEY)
  return header ? JSON.parse(header) : null
}
