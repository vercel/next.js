// @ts-check
import { NextResponse } from 'next/server'

/**
 * @param {import('next/server').NextRequest} request
 * @returns {NextResponse | undefined}
 */
export function middleware(request) {
  if (request.nextUrl.pathname === '/middleware-to-dashboard') {
    return NextResponse.rewrite(new URL('/dashboard', request.url))
  }

  if (request.nextUrl.pathname === '/redirect-middleware-to-dashboard') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (request.nextUrl.pathname.startsWith('/internal/test')) {
    const method = request.nextUrl.pathname.endsWith('rewrite')
      ? 'rewrite'
      : 'redirect'

    const internal = ['__flight__', '__flight_router_state_tree__']
    if (internal.some((name) => request.nextUrl.searchParams.has(name))) {
      return NextResponse[method](new URL('/internal/failure', request.url))
    }

    return NextResponse[method](new URL('/internal/success', request.url))
  }
}
