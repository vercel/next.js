// @ts-check
import { NextResponse } from 'next/server'
import { NEXT_RSC_UNION_QUERY } from 'next/dist/client/components/app-router-headers'

if (NEXT_RSC_UNION_QUERY !== '_rsc') {
  throw new Error(`NEXT_RSC_UNION_QUERY should be _rsc`)
}

/**
 * @param {import('next/server').NextRequest} request
 * @returns {NextResponse | undefined}
 */
export function middleware(request) {
  const rscQuery = request.nextUrl.searchParams.get(NEXT_RSC_UNION_QUERY)

  // Test that the RSC query is not present in the middleware
  if (rscQuery) {
    throw new Error('RSC query should not be present in the middleware')
  }

  if (request.nextUrl.pathname === '/redirect-middleware-to-dashboard') {
    return NextResponse.redirect(new URL('/redirect-dest', request.url))
  }

  if (request.nextUrl.pathname === '/redirect-on-refresh/auth') {
    const cookie = request.cookies.get('token')
    if (cookie) {
      return NextResponse.redirect(
        new URL('/redirect-on-refresh/dashboard', request.url)
      )
    }
  }
}
