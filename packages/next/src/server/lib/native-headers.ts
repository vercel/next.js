import type { IncomingMessage } from 'http'

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])
export function distinctHeaders(
  message: Pick<IncomingMessage, 'rawHeaders'>
): Record<string, string[]> {
  // Node's headersDistinct getter throws for names inherited from Object.prototype.
  const headers: Record<string, string[]> = Object.create(null)
  for (let i = 0; i < message.rawHeaders.length; i += 2) {
    const name = message.rawHeaders[i].toLowerCase()
    ;(headers[name] ||= []).push(message.rawHeaders[i + 1])
  }
  return headers
}

// Matchers, Go proxies, and Go routes must use the same effective header fields.
// Restore repeated fields only while their normalized value is unchanged, so
// request-header overrides still take precedence over the original wire fields.
export function prepareNativeRequestHeaders(
  req: Pick<IncomingMessage, 'headers' | 'rawHeaders'>
) {
  const rawValues = distinctHeaders(req)
  const connection = String(req.headers.connection || '').toLowerCase()
  const connectionHeaders = connection
    ? new Set(connection.split(',').map((name) => name.trim()))
    : undefined
  const headers: typeof req.headers = Object.create(null)
  for (const name in req.headers) {
    if (
      !Object.hasOwn(req.headers, name) ||
      HOP_BY_HOP_HEADERS.has(name) ||
      connectionHeaders?.has(name) ||
      name.startsWith('x-next-internal-')
    ) {
      continue
    }
    const value = req.headers[name]
    // Node sends Cookie as one semicolon-joined field, including when the
    // original request carried multiple Cookie fields.
    if (name === 'cookie') {
      headers[name] = Array.isArray(value) ? value.join('; ') : value
      continue
    }
    const raw = rawValues[name]
    headers[name] =
      raw && raw.length > 1 && value === raw.join(', ') ? raw : value
  }
  return {
    headers,
    hasBody: Boolean(
      rawValues['transfer-encoding'] ||
        rawValues['content-length']?.some((value) => Number(value) > 0)
    ),
  }
}
