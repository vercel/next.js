import type { AsyncLocalStorage as NodeAsyncLocalStorage } from 'async_hooks'

declare global {
  var AsyncLocalStorage: typeof NodeAsyncLocalStorage
}

export { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event'
export { NextRequest } from 'next/dist/server/web/spec-extension/request'
export { NextResponse } from 'next/dist/server/web/spec-extension/response'
export { NextMiddleware } from 'next/dist/server/web/types'
export { userAgentFromString } from 'next/dist/server/web/spec-extension/user-agent'
export { userAgent } from 'next/dist/server/web/spec-extension/user-agent'
export { URLPattern } from 'next/dist/compiled/@edge-runtime/primitives/url'
export { RequestCookies } from 'next/dist/server/web/spec-extension/cookies/request-cookies'
export { ResponseCookies } from 'next/dist/server/web/spec-extension/cookies/response-cookies'
export {
  RequestCookie,
  ResponseCookie,
} from 'next/dist/server/web/spec-extension/cookies/types'
