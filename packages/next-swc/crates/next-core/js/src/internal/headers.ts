import { ServerInfo } from './server'

export type Headers = Record<string, string | string[]>
/**
 * Converts an array of raw header entries to a map of header names to values.
 */
export function headersFromEntries(entries: Array<[string, string]>): Headers {
  const headers: Record<string, string | string[]> = Object.create(null)
  for (const [key, value] of entries) {
    if (key in headers) {
      const prevValue = headers[key]
      if (typeof prevValue === 'string') {
        headers[key] = [prevValue, value]
      } else {
        prevValue.push(value)
      }
    } else {
      headers[key] = value
    }
  }
  return headers
}

/**
 * Transforms an array of elements into an array of pairs of elements.
 *
 * ## Example
 *
 * ```ts
 * toPairs(["a", "b", "c", "d"]) // => [["a", "b"], ["c", "d"]]
 * ```
 */
export function toPairs<T>(arr: T[]): Array<[T, T]> {
  if (arr.length % 2 !== 0) {
    throw new Error('toPairs: expected an even number of elements')
  }

  const pairs: Array<[T, T]> = []
  for (let i = 0; i < arr.length; i += 2) {
    pairs.push([arr[i], arr[i + 1]])
  }

  return pairs
}

/**
 * These headers are provided by default to match the http-proxy behavior
 * https://github.com/http-party/node-http-proxy/blob/9b96cd72/lib/http-proxy/passes/web-incoming.js#L58-L86
 */
export function initProxiedHeaders(
  headers: Headers,
  proxiedFor: ServerInfo | null | undefined
): Headers {
  const hostname = proxiedFor?.hostname || 'localhost'
  const port = String(proxiedFor?.port || 3000)
  headers['x-forwarded-for'] = proxiedFor?.ip || '::1'
  headers['x-forwarded-host'] = `${hostname}:${port}`
  headers['x-forwarded-port'] = port
  headers['x-forwarded-proto'] = proxiedFor?.protocol || 'http'
  return headers
}
