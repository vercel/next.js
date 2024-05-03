import type { NextApiRequestCookies } from '.'

/**
 * Parse cookies from the `headers` of request
 * @param req request object
 */

export function getCookieParser(headers: {
  [key: string]: string | string[] | null | undefined
}): () => NextApiRequestCookies {
  return function parseCookie(): NextApiRequestCookies {
    const { cookie } = headers

    if (!cookie) {
      return {}
    }

    const { parse: parseCookieFn } = require('next/dist/compiled/cookie')
    return parseCookieFn(Array.isArray(cookie) ? cookie.join('; ') : cookie)
  }
}
