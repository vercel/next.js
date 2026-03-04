/**
 * Based on https://github.com/facebook/react/blob/d4e78c42a94be027b4dc7ed2659a5fddfbf9bd4e/packages/react/src/ReactFetch.js
 */
import * as React from 'react'
import { cloneResponse } from './clone-response'
import { InvariantError } from '../../shared/lib/invariant-error'

const simpleCacheKey = '["GET",[],null,"follow",null,null,null,null]' // generateCacheKey(new Request('https://blank'));
const MAX_BUFFER_BYTES = 1024 * 1024

async function consumeBodyWithLimit(
  body: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<ArrayBuffer> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error(
          `Response body exceeds ${maxBytes} bytes, aborting to prevent memory growth`
        )
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const buffer = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return buffer.buffer
}

function buildConsumedResponse(
  body: ArrayBuffer,
  original: Response
): Response {
  const consumed = new Response(body, {
    status: original.status,
    statusText: original.statusText,
    headers: original.headers,
  })
  Object.defineProperty(consumed, 'url', {
    value: original.url,
    configurable: true,
    enumerable: true,
    writable: false,
  })
  return consumed
}

// Headers that should not affect deduplication
// traceparent and tracestate are used for distributed tracing and should not affect cache keys
const headersToExcludeInCacheKey = new Set(['traceparent', 'tracestate'])

function generateCacheKey(request: Request): string {
  // We pick the fields that goes into the key used to dedupe requests.
  // We don't include the `cache` field, because we end up using whatever
  // caching resulted from the first request.
  // Notably we currently don't consider non-standard (or future) options.
  // This might not be safe. TODO: warn for non-standard extensions differing.
  // IF YOU CHANGE THIS UPDATE THE simpleCacheKey ABOVE.

  const filteredHeaders = Array.from(request.headers.entries()).filter(
    ([key]) => !headersToExcludeInCacheKey.has(key.toLowerCase())
  )

  return JSON.stringify([
    request.method,
    filteredHeaders,
    request.mode,
    request.redirect,
    request.credentials,
    request.referrer,
    request.referrerPolicy,
    request.integrity,
  ])
}

type CacheEntry = [
  key: string,
  promise: Promise<Response>,
  response: Response | null,
]

export function createDedupeFetch(originalFetch: typeof fetch) {
  const getCacheEntries = React.cache(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- url is the cache key
    (url: string): CacheEntry[] => []
  )

  return function dedupeFetch(
    resource: URL | RequestInfo,
    options?: RequestInit
  ): Promise<Response> {
    if (options && options.signal) {
      // If we're passed a signal, then we assume that
      // someone else controls the lifetime of this object and opts out of
      // caching. It's effectively the opt-out mechanism.
      // Ideally we should be able to check this on the Request but
      // it always gets initialized with its own signal so we don't
      // know if it's supposed to override - unless we also override the
      // Request constructor.
      return originalFetch(resource, options)
    }
    // Normalize the Request
    let url: string
    let cacheKey: string
    if (typeof resource === 'string' && !options) {
      // Fast path.
      cacheKey = simpleCacheKey
      url = resource
    } else {
      // Normalize the request.
      // if resource is not a string or a URL (its an instance of Request)
      // then do not instantiate a new Request but instead
      // reuse the request as to not disturb the body in the event it's a ReadableStream.
      const request =
        typeof resource === 'string' || resource instanceof URL
          ? new Request(resource, options)
          : resource
      if (
        (request.method !== 'GET' && request.method !== 'HEAD') ||
        request.keepalive
      ) {
        // We currently don't dedupe requests that might have side-effects. Those
        // have to be explicitly cached. We assume that the request doesn't have a
        // body if it's GET or HEAD.
        // keepalive gets treated the same as if you passed a custom cache signal.
        return originalFetch(resource, options)
      }
      cacheKey = generateCacheKey(request)
      url = request.url
    }

    const cacheEntries = getCacheEntries(url)
    for (let i = 0, j = cacheEntries.length; i < j; i += 1) {
      const [key, promise] = cacheEntries[i]
      if (key === cacheKey) {
        return promise.then(() => {
          const response = cacheEntries[i][2]
          if (!response) throw new InvariantError('No cached response')

          // We're cloning the response using this utility because there exists
          // a bug in the undici library around response cloning. See the
          // following pull request for more details:
          // https://github.com/vercel/next.js/pull/73274
          const [cloned1, cloned2] = cloneResponse(response)
          cacheEntries[i][2] = cloned2
          return cloned1
        })
      }
    }

    // We pass the original arguments here in case normalizing the Request
    // doesn't include all the options in this environment.
    const promise = originalFetch(resource, options)
    const entry: CacheEntry = [cacheKey, promise, null]
    cacheEntries.push(entry)

    return promise.then(async (response) => {
      if (!response.body) {
        entry[2] = response
        return response
      }

      const contentLength = response.headers.get('content-length')
      const parsedLength =
        contentLength !== null ? parseInt(contentLength, 10) : NaN
      const knownLarge =
        !Number.isNaN(parsedLength) && parsedLength > MAX_BUFFER_BYTES

      if (knownLarge) {
        const [cloned1, cloned2] = cloneResponse(response)
        entry[2] = cloned2
        return cloned1
      }

      const body = await consumeBodyWithLimit(response.body, MAX_BUFFER_BYTES)
      const consumed = buildConsumedResponse(body, response)
      const [cloned1, cloned2] = cloneResponse(consumed)
      entry[2] = cloned2
      return cloned1
    })
  }
}
