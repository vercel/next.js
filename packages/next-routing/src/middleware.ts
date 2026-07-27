import type { MiddlewareResult } from './types'

/**
 * Converts a middleware Response object to a MiddlewareResult.
 * This function processes middleware response headers and applies transformations
 * such as header overrides, rewrites, redirects, and refresh signals.
 *
 * @param response - The Response object returned from middleware
 * @param requestHeaders - The request Headers object to be mutated
 * @param url - The original request URL
 * @returns A MiddlewareResult object with processed headers and routing information
 */
export function responseToMiddlewareResult(
  response: Response,
  requestHeaders: Headers,
  url: URL
): MiddlewareResult {
  const result: MiddlewareResult = {}

  // Convert response headers to a mutable record
  const middlewareHeaders: Record<string, string | string[] | undefined> = {}
  response.headers.forEach((value, key) => {
    if (middlewareHeaders[key]) {
      // If header already exists, convert to array
      const existing = middlewareHeaders[key]
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        middlewareHeaders[key] = [existing as string, value]
      }
    } else {
      middlewareHeaders[key] = value
    }
  })

  // Handle x-middleware-override-headers
  // This special header contains a comma-separated list of header keys that should be overridden
  if (middlewareHeaders['x-middleware-override-headers']) {
    const overriddenHeaders: Set<string> = new Set()
    let overrideHeaders: string | string[] =
      middlewareHeaders['x-middleware-override-headers']

    if (typeof overrideHeaders === 'string') {
      overrideHeaders = overrideHeaders.split(',')
    }

    for (const key of overrideHeaders) {
      overriddenHeaders.add(key.trim())
    }
    delete middlewareHeaders['x-middleware-override-headers']

    // Delete headers not in the override list
    const headersToDelete: string[] = []
    requestHeaders.forEach((_, key) => {
      if (!overriddenHeaders.has(key)) {
        headersToDelete.push(key)
      }
    })
    for (const key of headersToDelete) {
      requestHeaders.delete(key)
    }

    // Update or add headers from the override list
    for (const key of overriddenHeaders.keys()) {
      const valueKey = 'x-middleware-request-' + key
      const newValue = middlewareHeaders[valueKey]

      if (newValue === undefined || newValue === null) {
        // If no value provided, delete the header
        requestHeaders.delete(key)
      } else if (Array.isArray(newValue)) {
        // Set the first value, then append the rest
        requestHeaders.set(key, newValue[0])
        for (let i = 1; i < newValue.length; i++) {
          requestHeaders.append(key, newValue[i])
        }
      } else {
        requestHeaders.set(key, newValue)
      }
      delete middlewareHeaders[valueKey]
    }
  }

  // If there's no rewrite, next, or location header, set refresh
  if (
    !middlewareHeaders['x-middleware-rewrite'] &&
    !middlewareHeaders['x-middleware-next'] &&
    !middlewareHeaders['location']
  ) {
    middlewareHeaders['x-middleware-refresh'] = '1'
  }
  delete middlewareHeaders['x-middleware-next']

  // Prepare response headers
  const responseHeaders = new Headers()

  for (const [key, value] of Object.entries(middlewareHeaders)) {
    // Skip internal headers that shouldn't be in response
    if (
      [
        'content-length',
        'x-middleware-rewrite',
        'x-middleware-redirect',
        'x-middleware-refresh',
      ].includes(key)
    ) {
      continue
    }

    // x-middleware-set-cookie is only for the request
    if (key === 'x-middleware-set-cookie') {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          for (const v of value) {
            requestHeaders.append(key, v)
          }
        } else {
          requestHeaders.set(key, value)
        }
      }
      continue
    }

    // Add to both response and request headers
    if (value !== undefined) {
      if (Array.isArray(value)) {
        for (const v of value) {
          responseHeaders.append(key, v)
          requestHeaders.append(key, v)
        }
      } else {
        responseHeaders.set(key, value)
        requestHeaders.set(key, value)
      }
    }
  }

  result.responseHeaders = responseHeaders
  result.requestHeaders = requestHeaders

  // Handle x-middleware-rewrite
  if (middlewareHeaders['x-middleware-rewrite']) {
    const value = middlewareHeaders['x-middleware-rewrite'] as string
    const destination = getRelativeURL(value, url.toString())
    responseHeaders.set('x-middleware-rewrite', destination)

    try {
      const rewriteUrl = new URL(destination, url)

      // If the URL has a different origin (external rewrite), mark it
      if (rewriteUrl.origin !== url.origin) {
        result.rewrite = rewriteUrl
        return result
      }

      result.rewrite = rewriteUrl
    } catch {
      // If URL parsing fails, treat as relative path
      result.rewrite = new URL(destination, url)
    }
  }

  // Handle location header (redirects)
  if (middlewareHeaders['location']) {
    const value = middlewareHeaders['location'] as string

    // Only process Location header as a redirect if it has a proper redirect status
    const isRedirectStatus = allowedStatusCodes.has(response.status)

    if (isRedirectStatus) {
      // Process as redirect: convert to relative URL
      const rel = getRelativeURL(value, url.toString())
      responseHeaders.set('location', rel)

      try {
        const redirectUrl = new URL(rel, url)
        result.redirect = {
          url: redirectUrl,
          status: response.status,
        }
        return result
      } catch {
        // If URL parsing fails, treat as relative
        result.redirect = {
          url: new URL(rel, url),
          status: response.status,
        }
        return result
      }
    } else {
      // Not a redirect: just pass through the Location header
      responseHeaders.set('location', value)
      return result
    }
  }

  // Handle x-middleware-refresh
  if (middlewareHeaders['x-middleware-refresh']) {
    result.bodySent = true
    return result
  }

  return result
}

/**
 * Helper function to convert an absolute URL to a relative URL.
 * If the URL has the same origin as the base, returns a relative path.
 * Otherwise, returns the full URL.
 */
function getRelativeURL(destination: string, base: string): string {
  try {
    const destUrl = new URL(destination, base)
    const baseUrl = new URL(base)

    // If same origin, return relative path
    if (destUrl.origin === baseUrl.origin) {
      return destUrl.pathname + destUrl.search + destUrl.hash
    }

    // Different origin, return full URL
    return destUrl.toString()
  } catch {
    // If parsing fails, return as-is
    return destination
  }
}

/**
 * Set of allowed redirect status codes
 */
const allowedStatusCodes = new Set([301, 302, 303, 307, 308])
