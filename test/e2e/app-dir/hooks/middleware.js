// @ts-check
import { NextResponse } from 'next/server'

/**
 * @param {import('next/server').NextRequest} request
 * @returns {NextResponse | undefined}
 */
export function middleware(request) {
  if (
    request.nextUrl.pathname ===
    '/hooks/use-selected-layout-segment/rewritten-middleware'
  ) {
    return NextResponse.rewrite(
      new URL(
        '/hooks/use-selected-layout-segment/first/slug3/second/catch/all',
        request.url
      )
    )
  }
}
