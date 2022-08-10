/* global URLPattern */

// This file is using `typeof EdgeRuntime === 'string'` everywhere, to check
// whether we are running in Edge runtime. This is allowing Webpack to use dead-code
// elimination and to remove the unused polyfills from the bundle, to make sure
// we don't bloat Edge bundle sizes.

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
  crypto:
    typeof EdgeRuntime === 'string'
      ? crypto
      : /*#__PURE__*/ require('next/dist/compiled/@edge-runtime/primitives/crypto')
          .crypto,
}

module.exports = serverExports
