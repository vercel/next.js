/* global URLPattern */

const serverExports = {
  NextRequest:
    /*#__PURE__*/ require('next/dist/server/web/spec-extension/request')
      .NextRequest,
  NextResponse:
    /*#__PURE__*/ require('next/dist/server/web/spec-extension/response')
      .NextResponse,
  userAgentFromString:
    /*#__PURE__*/ require('next/dist/server/web/spec-extension/user-agent')
      .userAgentFromString,
  userAgent:
    /*#__PURE__*/ require('next/dist/server/web/spec-extension/user-agent')
      .userAgent,
  URLPattern:
    typeof EdgeRuntime === 'string'
      ? URLPattern
      : /*#__PURE__*/ require('next/dist/compiled/@edge-runtime/primitives/url')
          .URLPattern,
}

module.exports = serverExports
