import type { AsyncLocalStorage as NodeAsyncLocalStorage } from 'async_hooks'

declare global {
  var AsyncLocalStorage: typeof NodeAsyncLocalStorage
}

export { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event'
export { NextRequest } from 'next/dist/server/web/spec-extension/request'
export { NextResponse } from 'next/dist/server/web/spec-extension/response'
export { NextMiddleware, MiddlewareConfig } from 'next/dist/server/web/types'
export { userAgentFromString } from 'next/dist/server/web/spec-extension/user-agent'
export { userAgent } from 'next/dist/server/web/spec-extension/user-agent'
export { URLPattern } from 'next/dist/compiled/@edge-runtime/primitives/url'
export { ImageResponse } from 'next/dist/server/web/spec-extension/image-response'
export type { ImageResponseOptions } from 'next/dist/compiled/@vercel/og/types'
export { after } from 'next/dist/server/after'
export { unstable_rootParams } from 'next/dist/server/request/root-params'
export { connection } from 'next/dist/server/request/connection'
export type { UnsafeUnwrappedSearchParams } from 'next/dist/server/request/search-params'
export type { UnsafeUnwrappedParams } from 'next/dist/server/request/params'
