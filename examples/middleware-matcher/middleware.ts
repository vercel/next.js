import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  const slug = path.slice(1)

  // Set a cookie on the response using the `ResponseCookies` API
  const response = NextResponse.next()
  response.cookies.set({
    name: 'middleware-slug',
    value: slug,
    path,
  })

  return response
}

export const config = {
  matcher: [
    '/disclaimer', // match a single, specific page
    '/((?!public|static).*)', // match all paths not starting with 'public' or 'static'
  ],
}
