import type { NodeHeaders } from './types'

export async function* streamToIterator<T>(
  readable: ReadableStream<T>
): AsyncIterableIterator<T> {
  const reader = readable.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) {
      yield value
    }
  }
  reader.releaseLock()
}

export function notImplemented(name: string, method: string): any {
  throw new Error(
    `Failed to get the '${method}' property on '${name}': the property is not implemented`
  )
}

export function fromNodeHeaders(object: NodeHeaders) {
  const headers: { [k: string]: string } = {}
  for (let headerKey in object) {
    const headerValue = object[headerKey]
    if (Array.isArray(headerValue)) {
      headers[headerKey] = headerValue.join('; ')
    } else if (headerValue) {
      headers[headerKey] = String(headerValue)
    }
  }
  return headers
}

export function toNodeHeaders(headers?: Headers): NodeHeaders {
  const object: NodeHeaders = {}
  if (headers) {
    for (const [key, value] of headers.entries()) {
      object[key] = value.includes(';') ? value.split(';') : value
    }
  }
  return object
}
