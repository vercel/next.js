import { NextResponse } from 'next/server'

export function middleware(req) {
  const url = req.nextUrl.clone()
  if (url.pathname.startsWith('/i18n')) {
    url.searchParams.set('locale', url.locale)
    return NextResponse.rewrite(url)
  }

  if (
    url.pathname === '/error-throw' &&
    req.headers.has('x-middleware-preflight')
  ) {
    throw new Error('test error')
  }
}
