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

export function fromNodeHeaders(object: NodeHeaders): Headers {
  const headers = new Headers()
  for (let [key, value] of Object.entries(object)) {
    const values = Array.isArray(value) ? value : [value]
    for (let v of values) {
      if (v !== undefined) {
        headers.append(key, v)
      }
    }
  }
  return headers
}

export function toNodeHeaders(headers?: Headers): NodeHeaders {
  const result: NodeHeaders = {}
  if (headers) {
    for (const [key, value] of headers.entries()) {
      result[key] = value
      if (key.toLowerCase() === 'set-cookie') {
        result[key] = value.split(', ')
      }
    }
  }
  return result
}
