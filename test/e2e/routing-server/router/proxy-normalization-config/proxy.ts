import { NextRequest, NextResponse } from 'next/server'

export default function proxy(request: NextRequest) {
  const url = new URL(request.url)
  return NextResponse.json({
    pathname: request.nextUrl.pathname,
    urlPathname: url.pathname,
    value: request.nextUrl.searchParams.get('value'),
    rscQuery: request.nextUrl.searchParams.get('_rsc'),
    navigation: Object.fromEntries(
      [
        'rsc',
        'next-router-state-tree',
        'next-router-prefetch',
        'next-router-segment-prefetch',
        'next-hmr-refresh',
      ].map((name) => [name, request.headers.get(name)])
    ),
  })
}

// Even with raw URL normalization disabled, a matcher targets the destination.
export const config = { matcher: '/inspection' }
