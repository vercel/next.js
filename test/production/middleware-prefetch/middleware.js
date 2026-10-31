import { NextResponse } from 'next/server'

export function middleware(request) {
  if (request.nextUrl.pathname === '/made-up') {
    return NextResponse.rewrite(new URL('/ssg-page', request.url))
  }

  if (request.nextUrl.pathname === '/ssg-page-2') {
    return Response.redirect('https://example.com')
  }
}
