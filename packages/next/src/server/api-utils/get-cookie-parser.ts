import type { NextApiRequestCookies } from '.'
import { splitCookiesString } from '../web/utils'

/**
 * Parse cookies from the `headers` of request
 * @param req request object
 */

export function getCookieParser(headers: {
  [key: string]: string | string[] | null | undefined
}): () => NextApiRequestCookies {
  return function parseCookie(): NextApiRequestCookies {
    const { cookie } = headers

    const { parse: parseCookieFn } =
      require('next/dist/compiled/cookie') as typeof import('next/dist/compiled/cookie')

    const parsed: NextApiRequestCookies = cookie
      ? parseCookieFn(Array.isArray(cookie) ? cookie.join('; ') : cookie)
      : {}

    // Merge cookies set by proxy so they're visible in
    // getServerSideProps and API routes on the same request.
    const middlewareCookieHeader = headers['x-middleware-set-cookie']
    if (typeof middlewareCookieHeader === 'string') {
      const pairs = splitCookiesString(middlewareCookieHeader)
        .map((s) => s.split(';')[0])
        .filter(Boolean)
        .join('; ')
      if (pairs) {
        Object.assign(parsed, parseCookieFn(pairs))
      }
    }

    return parsed
  }
}
