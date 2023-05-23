import type { AsyncLocalStorage as NodeAsyncLocalStorage } from 'async_hooks'

declare global {
  var AsyncLocalStorage: typeof NodeAsyncLocalStorage
}

export { NextResponse } from 'next/dist/server/web/spec-extension/response'
export { NextMiddleware } from 'next/dist/server/web/types'
export { userAgentFromString } from 'next/dist/server/web/spec-extension/user-agent'
export { userAgent } from 'next/dist/server/web/spec-extension/user-agent'
export { URLPattern } from 'next/dist/compiled/@edge-runtime/primitives/url'
export { ImageResponse } from 'next/dist/server/web/spec-extension/image-response'
export type { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event'
export type { NextRequest } from 'next/dist/server/web/spec-extension/request'
export type { ImageResponseOptions } from 'next/dist/compiled/@vercel/og/types'
