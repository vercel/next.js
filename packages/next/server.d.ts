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
export { default as revalidateTag } from 'next/dist/server/web/exports/revalidate-tag'
export { default as revalidatePath } from 'next/dist/server/web/exports/revalidate-path'
export { ImageResponse } from 'next/dist/server/web/spec-extension/image-response'
