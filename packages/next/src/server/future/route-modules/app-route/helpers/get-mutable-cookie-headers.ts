import { HeadersAdapter } from '../../../../web/spec-extension/adapters/headers'
import { ResponseCookies } from '../../../../web/spec-extension/cookies'
import { SYMBOL_MODIFY_COOKIE_VALUES } from '../../../../web/spec-extension/adapters/request-cookies'

export function getMutableCookieHeaders(
  headers: Headers,
  mutableCookies: ResponseCookies
): Headers {
  const modifiedCookieValues = (mutableCookies as any)[
    SYMBOL_MODIFY_COOKIE_VALUES
  ] as NonNullable<ReturnType<InstanceType<typeof ResponseCookies>['get']>>[]
  if (modifiedCookieValues.length) {
    // Return a new response that extends the response with
    // the modified cookies as fallbacks. `res`' cookies
    // will still take precedence.
    const resCookies = new ResponseCookies(HeadersAdapter.from(headers))
    const returnedCookies = resCookies.getAll()

    // Set the modified cookies as fallbacks.
    for (const cookie of modifiedCookieValues) {
      resCookies.set(cookie)
    }
    // Set the original cookies as the final values.
    for (const cookie of returnedCookies) {
      resCookies.set(cookie)
    }

    const responseHeaders = new Headers({})
    // Set all the headers except for the cookies.
    headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') {
        responseHeaders.append(key, value)
      }
    })
    // Set the final cookies, need to append cookies one
    // at a time otherwise it might not work in some browsers.
    resCookies.getAll().forEach((cookie) => {
      const tempCookies = new ResponseCookies(new Headers())
      tempCookies.set(cookie)
      responseHeaders.append('Set-Cookie', tempCookies.toString())
    })
    return responseHeaders
  }
  return headers
}
