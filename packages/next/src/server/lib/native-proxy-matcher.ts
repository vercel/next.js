import { IncomingMessage } from 'http'
import { NodeNextRequest } from '../base-http/node'
import { getCookieParser } from '../api-utils/get-cookie-parser'
import type {
  getMiddlewareRouteMatcher,
  MiddlewareRouteMatch,
} from '../../shared/lib/router/utils/middleware-route-matcher'
import { matchHas } from '../../shared/lib/router/utils/prepare-destination'
import { DecodeError } from '../../shared/lib/utils'
import { getCookieConditionDuplicatePattern } from '../../shared/lib/router/utils/cookie-condition'
import { prepareNativeRequestHeaders } from './native-headers'

export class InvalidGoProxyRequestError extends DecodeError {
  constructor() {
    super('Go proxy conditions require unambiguous request headers')
  }
}

export function getGoProxyMatcher(
  matchers: Parameters<typeof getMiddlewareRouteMatcher>[0]
): MiddlewareRouteMatch {
  const compiled = matchers.map((matcher) => ({
    matcher,
    regexp: new RegExp(matcher.regexp),
  }))
  const cookiePatterns = new Map<string, RegExp>()
  for (const matcher of matchers) {
    for (const condition of [
      ...(matcher.has || []),
      ...(matcher.missing || []),
    ]) {
      if (condition.type === 'cookie' && !cookiePatterns.has(condition.key)) {
        cookiePatterns.set(
          condition.key,
          new RegExp(`^${getCookieConditionDuplicatePattern(condition.key)}$`)
        )
      }
    }
  }
  return (pathname, req, query) => {
    let matched = false
    let request: Pick<NodeNextRequest, 'headers' | 'cookies'> | undefined
    let originalCookies: NodeNextRequest['cookies'] | undefined
    for (const { matcher, regexp } of compiled) {
      if (!regexp.test(pathname || '')) continue
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
        // Go proxies can protect either runtime. A condition cannot safely
        // select a resource when Go and JavaScript would see different values.
        for (const conditions of [matcher.has, matcher.missing]) {
          for (const condition of conditions || []) {
            let originalValue
            let forwardedValue
            if (condition.type === 'cookie') {
              const value = req.headers.cookie
              const cookie = Array.isArray(value) ? value.join('; ') : value
              if (cookie && cookiePatterns.get(condition.key)!.test(cookie)) {
                throw new InvalidGoProxyRequestError()
              }
              originalCookies ||= getCookieParser(req.headers)()
              originalValue = originalCookies[condition.key]
              forwardedValue = request.cookies[condition.key]
            } else if (
              condition.type === 'header' ||
              condition.type === 'host'
            ) {
              const key =
                condition.type === 'host' ? 'host' : condition.key.toLowerCase()
              const value = req.headers[key]
              originalValue = Array.isArray(value) ? value.join(', ') : value
              forwardedValue = request.headers[key]
            } else {
              continue
            }
            if (originalValue !== forwardedValue) {
              throw new InvalidGoProxyRequestError()
            }
          }
        }
        // Validate every path-matching condition even after another matcher
        // selected the proxy. Reordering OR alternatives must not change
        // whether an ambiguous request is rejected.
        if (
          !matched &&
          matchHas(request, query, matcher.has, matcher.missing)
        ) {
          matched = true
        }
      } else {
        matched = true
      }
    }
    return matched
  }
}
