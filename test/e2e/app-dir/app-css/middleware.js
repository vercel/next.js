import { NextResponse } from 'next/server'

export async function middleware(request) {
  // This middleware is used to test Suspensey CSS
  if (
    request.url.includes('_next/static/css/app/suspensey-css/slow/page.css')
  ) {
    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/_next/static/css/app/:name*',
}
