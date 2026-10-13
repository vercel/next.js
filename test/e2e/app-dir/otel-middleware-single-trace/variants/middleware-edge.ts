import type { NextRequest } from 'next/server'
import { handler } from '@/middleware-impl'

// Edge runtime middleware (`middleware.ts`). Copied to the app root by the test.
export function middleware(request: NextRequest) {
  return handler(request)
}

export const config = {
  matcher: [
    '/page',
    '/route-handler',
    '/rewrite',
    '/redirect',
    '/direct',
    '/user-overrides',
    '/user-traceparent',
  ],
}
