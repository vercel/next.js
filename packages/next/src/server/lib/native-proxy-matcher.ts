import { IncomingMessage } from 'http'
import { NodeNextRequest } from '../base-http/node'
import { getCookieParser } from '../api-utils/get-cookie-parser'
import type {
  getMiddlewareRouteMatcher,
  MiddlewareRouteMatch,
} from '../../shared/lib/router/utils/middleware-route-matcher'
import { matchHas } from '../../shared/lib/router/utils/prepare-destination'
import { prepareNativeRequestHeaders } from './native-route-proxy'

export function getGoProxyMatcher(
  matchers: Parameters<typeof getMiddlewareRouteMatcher>[0]
): MiddlewareRouteMatch {
  return (pathname, req, query) => {
    let request: Parameters<typeof matchHas>[0] | undefined
    for (const matcher of matchers) {
      if (!new RegExp(matcher.regexp).test(pathname || '')) continue
      if (matcher.has || matcher.missing) {
        if (!request) {
          const original =
            req instanceof NodeNextRequest ? req.originalRequest : req
          const { headers } = prepareNativeRequestHeaders({
            headers: req.headers,
            rawHeaders:
              original instanceof IncomingMessage ? original.rawHeaders : [],
          })
          // Go's Cookie methods inspect the combined Cookie field. Other
          // repeated fields are read by Header.Get using their first value.
          const cookies = getCookieParser(headers)()
          for (const name of Object.keys(headers)) {
            const value = headers[name]
            if (Array.isArray(value)) headers[name] = value[0]
          }
          request = { headers, cookies }
        }
        if (!matchHas(request, query, matcher.has, matcher.missing)) continue
      }
      return true
    }
    return false
  }
}
