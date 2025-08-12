import { NextResponse } from 'next/server'

export default async function middleware() {
  let response = NextResponse.next()
  return response
}

export const config = {
  matcher: [
    /**
     * Match all request paths except for those starting with:
     * - /api/ (API routes)
     * - /_next/ (Static assets and images)
     * - /blog/feed.xml (RSS feed)
     * - /feed.xml (RSS feed)
     * - /favicon.svg (favicon)
     * - /img/ (images in the public dir)
     */
    '/((?!api\\/|_next\\/|blog\\/feed.xml|feed.xml|favicon\\.svg|img\\/).*)',
  ],
}
