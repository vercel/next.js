import type { AsyncLocalStorage as NodeAsyncLocalStorage } from 'async_hooks'

declare global {
  var AsyncLocalStorage: typeof NodeAsyncLocalStorage
}

export { NextFetchEvent } from './dist/server/web/spec-extension/fetch-event'
export { NextRequest } from './dist/server/web/spec-extension/request'
export { NextResponse } from './dist/server/web/spec-extension/response'
export { NextMiddleware, MiddlewareConfig } from './dist/server/web/types'
export { userAgentFromString } from './dist/server/web/spec-extension/user-agent'
export { userAgent } from './dist/server/web/spec-extension/user-agent'
export { URLPattern } from './dist/compiled/@edge-runtime/primitives/url'
export { ImageResponse } from './dist/server/web/spec-extension/image-response'
export type { ImageResponseOptions } from './dist/compiled/@vercel/og/types'
export { unstable_after } from './dist/server/after'
