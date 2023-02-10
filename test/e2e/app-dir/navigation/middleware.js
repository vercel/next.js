// @ts-check
import { NextResponse } from 'next/server'

/**
 * @param {import('next/server').NextRequest} request
 * @returns {NextResponse | undefined}
 */
export function middleware(request) {
  if (request.nextUrl.pathname === '/redirect-middleware-to-dashboard') {
    return NextResponse.redirect(new URL('/redirect-dest', request.url))
  }
}
