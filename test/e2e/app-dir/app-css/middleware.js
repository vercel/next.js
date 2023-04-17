import { NextResponse } from 'next/server'

export async function middleware(request) {
  // This middleware is used to test Suspensey CSS
  if (
    request.url.endsWith('_next/static/css/app/suspensey-css/slow/page.css')
  ) {
    await new Promise((resolve) => setTimeout(resolve, 150))
  } else if (
    request.url.endsWith('_next/static/css/app/suspensey-css/timeout/page.css')
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/_next/static/css/app/:name*',
}
