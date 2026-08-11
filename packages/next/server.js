let serverExports

if (process.env.NEXT_RUNTIME === '') {
  // Browser
  const notAvailableInClient = (name) => {
    return function notAvailable() {
      throw new Error(`\`${name}\` is only available in a Server Component.`)
    }
  }
  // NOTE: this diverges from `invalid_client_lib_apis_mapping`, which
  // allows importing everything except `after`.
  // We assume that this code is not useful in browser bundles and pulling it in
  // would be undesireable, so we only allow `connection`.
  serverExports = {
    NextRequest: notAvailableInClient('NextRequest'),
    NextResponse: notAvailableInClient('NextResponse'),
    ImageResponse: notAvailableInClient('ImageResponse'),
    userAgentFromString: notAvailableInClient('userAgentFromString'),
    userAgent: notAvailableInClient('userAgent'),
    URLPattern: notAvailableInClient('URLPattern'),
    after: notAvailableInClient('after'),
    connection: require('next/dist/client/request/connection.browser')
      .connection,
  }
} else {
  // Server (RSC or SSR)
  serverExports = {
    NextRequest: require('next/dist/server/web/spec-extension/request')
      .NextRequest,
    NextResponse: require('next/dist/server/web/spec-extension/response')
      .NextResponse,
    ImageResponse: require('next/dist/server/web/spec-extension/image-response')
      .ImageResponse,
    userAgentFromString:
      require('next/dist/server/web/spec-extension/user-agent')
        .userAgentFromString,
    userAgent: require('next/dist/server/web/spec-extension/user-agent')
      .userAgent,
    URLPattern: require('next/dist/server/web/spec-extension/url-pattern')
      .URLPattern,
    after: require('next/dist/server/after').after,
    connection: require('next/dist/server/request/connection').connection,
  }
}

// https://nodejs.org/api/esm.html#commonjs-namespaces
// When importing CommonJS modules, the module.exports object is provided as the default export
module.exports = serverExports

// make import { xxx } from 'next/server' work
exports.NextRequest = serverExports.NextRequest
exports.NextResponse = serverExports.NextResponse
exports.ImageResponse = serverExports.ImageResponse
exports.userAgentFromString = serverExports.userAgentFromString
exports.userAgent = serverExports.userAgent
exports.URLPattern = serverExports.URLPattern
exports.after = serverExports.after
exports.connection = serverExports.connection
