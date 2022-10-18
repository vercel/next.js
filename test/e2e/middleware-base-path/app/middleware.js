import { NextResponse } from 'next/server'

export async function middleware(request) {
  const url = request.nextUrl

  if (
    request.method === 'HEAD' &&
    url.basePath === '/root' &&
    url.pathname === '/redirect-me-to-about'
  ) {
    url.pathname = '/about'
    return NextResponse.redirect(url)
  }

  if (url.pathname === '/redirect-with-basepath' && !url.basePath) {
    url.basePath = '/root'
    return NextResponse.redirect(url)
  }

  if (url.pathname === '/redirect-with-basepath') {
    url.pathname = '/about'
    return NextResponse.rewrite(url)
  }
}
