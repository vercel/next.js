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

export function readableStreamTee<T = any>(
  readable: ReadableStream<T>
): [ReadableStream<T>, ReadableStream<T>] {
  const transformStream = new TransformStream()
  const transformStream2 = new TransformStream()
  const writer = transformStream.writable.getWriter()
  const writer2 = transformStream2.writable.getWriter()

  const reader = readable.getReader()
  function read() {
    reader.read().then(({ done, value }) => {
      if (done) {
        writer.close()
        writer2.close()
        return
      }
      writer.write(value)
      writer2.write(value)
      read()
    })
  }
  read()

  return [transformStream.readable, transformStream2.readable] as any
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
        result[key] = splitCookiesString(value)
      }
    }
  }
  return result
}

/*
  Set-Cookie header field-values are sometimes comma joined in one string. This splits them without choking on commas
  that are within a single set-cookie field-value, such as in the Expires portion.
  This is uncommon, but explicitly allowed - see https://tools.ietf.org/html/rfc2616#section-4.2
  Node.js does this for every header *except* set-cookie - see https://github.com/nodejs/node/blob/d5e363b77ebaf1caf67cd7528224b651c86815c1/lib/_http_incoming.js#L128
  React Native's fetch does this for *every* header, including set-cookie.
  
  Based on: https://github.com/google/j2objc/commit/16820fdbc8f76ca0c33472810ce0cb03d20efe25
  Credits to: https://github.com/tomball for original and https://github.com/chrusart for JavaScript implementation
*/
export function splitCookiesString(cookiesString: string) {
  var cookiesStrings = []
  var pos = 0
  var start
  var ch
  var lastComma
  var nextStart
  var cookiesSeparatorFound

  function skipWhitespace() {
    while (pos < cookiesString.length && /\s/.test(cookiesString.charAt(pos))) {
      pos += 1
    }
    return pos < cookiesString.length
  }

  function notSpecialChar() {
    ch = cookiesString.charAt(pos)

    return ch !== '=' && ch !== ';' && ch !== ','
  }

  while (pos < cookiesString.length) {
    start = pos
    cookiesSeparatorFound = false

    while (skipWhitespace()) {
      ch = cookiesString.charAt(pos)
      if (ch === ',') {
        // ',' is a cookie separator if we have later first '=', not ';' or ','
        lastComma = pos
        pos += 1

        skipWhitespace()
        nextStart = pos

        while (pos < cookiesString.length && notSpecialChar()) {
          pos += 1
        }

        // currently special character
        if (pos < cookiesString.length && cookiesString.charAt(pos) === '=') {
          // we found cookies separator
          cookiesSeparatorFound = true
          // pos is inside the next cookie, so back up and return it.
          pos = nextStart
          cookiesStrings.push(cookiesString.substring(start, lastComma))
          start = pos
        } else {
          // in param ',' or param separator ';',
          // we continue from that comma
          pos = lastComma + 1
        }
      } else {
        pos += 1
      }
    }

    if (!cookiesSeparatorFound || pos >= cookiesString.length) {
      cookiesStrings.push(cookiesString.substring(start, cookiesString.length))
    }
  }

  return cookiesStrings
}

/**
 * We will be soon deprecating the usage of relative URLs in Middleware introducing
 * URL validation. This helper puts the future code in place and prints a warning
 * for cases where it will break. Meanwhile we preserve the previous behavior.
 */
export function validateURL(url: string | URL): string {
  try {
    return String(new URL(String(url)))
  } catch (error: any) {
    console.log(
      `warn  -`,
      'using relative URLs for Middleware will be deprecated soon - https://nextjs.org/docs/messages/middleware-relative-urls'
    )
    return String(url)
  }
}
