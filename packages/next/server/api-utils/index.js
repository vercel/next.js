'use strict'
Object.defineProperty(exports, '__esModule', {
  value: true,
})
exports.getCookieParser = getCookieParser
exports.sendStatusCode = sendStatusCode
exports.redirect = redirect
exports.checkIsManualRevalidate = checkIsManualRevalidate
exports.clearPreviewData = clearPreviewData
exports.sendError = sendError
exports.setLazyProp = setLazyProp
exports.SYMBOL_CLEARED_COOKIES =
  exports.SYMBOL_PREVIEW_DATA =
  exports.RESPONSE_LIMIT_DEFAULT =
  exports.COOKIE_NAME_PRERENDER_DATA =
  exports.COOKIE_NAME_PRERENDER_BYPASS =
  exports.PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER =
  exports.PRERENDER_REVALIDATE_HEADER =
    void 0
function getCookieParser(headers) {
  return function parseCookie() {
    const header = headers.cookie
    if (!header) {
      return {}
    }
    const { parse: parseCookieFn } = require('next/dist/compiled/cookie')
    return parseCookieFn(Array.isArray(header) ? header.join(';') : header)
  }
}
function sendStatusCode(res, statusCode) {
  res.statusCode = statusCode
  return res
}
function redirect(res, statusOrUrl, url) {
  if (typeof statusOrUrl === 'string') {
    url = statusOrUrl
    statusOrUrl = 307
  }
  if (typeof statusOrUrl !== 'number' || typeof url !== 'string') {
    throw new Error(
      `Invalid redirect arguments. Please use a single argument URL, e.g. res.redirect('/destination') or use a status code and URL, e.g. res.redirect(307, '/destination').`
    )
  }
  res.writeHead(statusOrUrl, {
    Location: url,
  })
  res.write(url)
  res.end()
  return res
}
const PRERENDER_REVALIDATE_HEADER = 'x-prerender-revalidate'
exports.PRERENDER_REVALIDATE_HEADER = PRERENDER_REVALIDATE_HEADER
const PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER =
  'x-prerender-revalidate-if-generated'
exports.PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER =
  PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER
function checkIsManualRevalidate(req, previewProps) {
  return {
    isManualRevalidate:
      req.headers[PRERENDER_REVALIDATE_HEADER] === previewProps.previewModeId,
    revalidateOnlyGenerated:
      !!req.headers[PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER],
  }
}
const COOKIE_NAME_PRERENDER_BYPASS = `__prerender_bypass`
exports.COOKIE_NAME_PRERENDER_BYPASS = COOKIE_NAME_PRERENDER_BYPASS
const COOKIE_NAME_PRERENDER_DATA = `__next_preview_data`
exports.COOKIE_NAME_PRERENDER_DATA = COOKIE_NAME_PRERENDER_DATA
const RESPONSE_LIMIT_DEFAULT = 4 * 1024 * 1024
exports.RESPONSE_LIMIT_DEFAULT = RESPONSE_LIMIT_DEFAULT
const SYMBOL_PREVIEW_DATA = Symbol(COOKIE_NAME_PRERENDER_DATA)
exports.SYMBOL_PREVIEW_DATA = SYMBOL_PREVIEW_DATA
const SYMBOL_CLEARED_COOKIES = Symbol(COOKIE_NAME_PRERENDER_BYPASS)
exports.SYMBOL_CLEARED_COOKIES = SYMBOL_CLEARED_COOKIES
function clearPreviewData(res) {
  if (SYMBOL_CLEARED_COOKIES in res) {
    return res
  }
  const { serialize } = require('next/dist/compiled/cookie')
  const previous = res.getHeader('Set-Cookie')
  res.setHeader(`Set-Cookie`, [
    ...(typeof previous === 'string'
      ? [previous]
      : Array.isArray(previous)
      ? previous
      : []),
    serialize(COOKIE_NAME_PRERENDER_BYPASS, '', {
      // To delete a cookie, set `expires` to a date in the past:
      // https://tools.ietf.org/html/rfc6265#section-4.1.1
      // `Max-Age: 0` is not valid, thus ignored, and the cookie is persisted.
      expires: new Date(0),
      httpOnly: true,
      sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax',
      secure: process.env.NODE_ENV !== 'development',
      path: '/',
    }),
    serialize(COOKIE_NAME_PRERENDER_DATA, '', {
      // To delete a cookie, set `expires` to a date in the past:
      // https://tools.ietf.org/html/rfc6265#section-4.1.1
      // `Max-Age: 0` is not valid, thus ignored, and the cookie is persisted.
      expires: new Date(0),
      httpOnly: true,
      sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax',
      secure: process.env.NODE_ENV !== 'development',
      path: '/',
    }),
  ])
  Object.defineProperty(res, SYMBOL_CLEARED_COOKIES, {
    value: true,
    enumerable: false,
  })
  return res
}
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}
exports.ApiError = ApiError
function sendError(res, statusCode, message) {
  res.statusCode = statusCode
  res.statusMessage = message
  res.end(message)
}
function setLazyProp({ req }, prop, getter) {
  const opts = {
    configurable: true,
    enumerable: true,
  }
  const optsReset = {
    ...opts,
    writable: true,
  }
  Object.defineProperty(req, prop, {
    ...opts,
    get: () => {
      const value = getter()
      // we set the property on the object to avoid recalculating it
      Object.defineProperty(req, prop, {
        ...optsReset,
        value,
      })
      return value
    },
    set: (value) => {
      Object.defineProperty(req, prop, {
        ...optsReset,
        value,
      })
    },
  })
}

//# sourceMappingURL=index.js.map
