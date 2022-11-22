const serverExports = {
  NextRequest: require('next/dist/server/web/spec-extension/request')
    .NextRequest,
  NextResponse: require('next/dist/server/web/spec-extension/response')
    .NextResponse,
  userAgentFromString: require('next/dist/server/web/spec-extension/user-agent')
    .userAgentFromString,
  userAgent: require('next/dist/server/web/spec-extension/user-agent')
    .userAgent,
  RequestCookies:
    require('next/dist/server/web/spec-extension/cookies/request-cookies')
      .RequestCookies,
  ResponseCookies:
    require('next/dist/server/web/spec-extension/cookies/response-cookies')
      .ResponseCookies,
}

if (typeof URLPattern !== 'undefined') {
  // eslint-disable-next-line no-undef
  serverExports.URLPattern = URLPattern
}

// https://nodejs.org/api/esm.html#commonjs-namespaces
// When importing CommonJS modules, the module.exports object is provided as the default export
module.exports = serverExports

// make import { xxx } from 'next/server' work
exports.NextRequest = serverExports.NextRequest
exports.NextResponse = serverExports.NextResponse
exports.userAgentFromString = serverExports.userAgentFromString
exports.userAgent = serverExports.userAgent
exports.URLPattern = serverExports.URLPattern
exports.RequestCookies = serverExports.RequestCookies
exports.ResponseCookies = serverExports.ResponseCookies
