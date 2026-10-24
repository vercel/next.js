import type { OutgoingHttpHeaders } from 'http'

/** Live status observation and updates, without access to the HTTP transport. */
export type RenderStatus = {
  statusCode: number | undefined
}

/** Header effects must be delivered before a dynamic response starts streaming. */
export type RenderHeaderSink = {
  setHeader(name: string, value: string | string[]): void
  appendHeader(name: string, value: string | string[]): void
}

/**
 * A prerender records its own header output, including during background
 * revalidation when the original response has already finished. Seed values
 * participate in append operations, but only headers written by this render
 * become output metadata.
 */
export function createPrerenderHeaders(initialHeaders: OutgoingHttpHeaders) {
  const headers: OutgoingHttpHeaders = {}
  if (process.env.NEXT_RUNTIME === 'edge') {
    const values = new Headers()
    for (const [name, value] of Object.entries(initialHeaders)) {
      if (value !== undefined) {
        for (const item of Array.isArray(value) ? value : [value]) {
          values.append(name, String(item))
        }
      }
    }
    return {
      headers,
      setHeader(name: string, value: string | string[]) {
        values.delete(name)
        for (const item of Array.isArray(value) ? value : [value]) {
          values.append(name, item)
        }
        headers[name] = values.get(name) ?? undefined
      },
      appendHeader(name: string, value: string | string[]) {
        for (const item of Array.isArray(value) ? value : [value]) {
          values.append(name, item)
        }
        headers[name] = values.get(name) ?? undefined
      },
    }
  } else {
    const values = new Map<string, string[]>()
    for (const [name, value] of Object.entries(initialHeaders)) {
      if (value !== undefined) {
        values.set(
          name.toLowerCase(),
          (Array.isArray(value) ? value : [value]).map(String)
        )
      }
    }
    return {
      headers,
      setHeader(name: string, value: string | string[]) {
        const items = Array.isArray(value) ? [...value] : [value]
        values.set(name.toLowerCase(), items)
        headers[name] = items.join(',')
      },
      appendHeader(name: string, value: string | string[]) {
        const key = name.toLowerCase()
        const items = values.get(key) ?? []
        for (const item of Array.isArray(value) ? value : [value]) {
          if (!items.includes(item)) {
            items.push(item)
            values.set(key, items)
          }
        }
        headers[name] = values.has(key) ? items.join(',') : undefined
      },
    }
  }
}
