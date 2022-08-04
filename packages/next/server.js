const serverExports = {
  NextRequest: require('next/dist/server/web/spec-extension/request')
    .NextRequest,
  NextResponse: require('next/dist/server/web/spec-extension/response')
    .NextResponse,
  userAgentFromString: require('next/dist/server/web/spec-extension/user-agent')
    .userAgentFromString,
  userAgent: require('next/dist/server/web/spec-extension/user-agent')
    .userAgent,
}

if (typeof URLPattern !== 'undefined') {
  // eslint-disable-next-line no-undef
  serverExports.URLPattern = URLPattern
}

module.exports = serverExports
