import { NextResponse } from 'next/server'

export default function middleware(req) {
  const { pathname } = new URL(req.url)
  const response = NextResponse.next()
  response.headers.set(
    'set-cookie',
    `middleware-slug=${pathname.slice(1)}; Path=${pathname}`
  )
  return response
}

export const config = {
  matcher: ['/public/disclaimer', '/((?!public|static).*)'],
}
