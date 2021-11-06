import { NextResponse } from 'next/server'

export async function middleware(request) {
  const url = request.nextUrl
  if (url.pathname === '/redirect-with-basepath' && !url.basePath) {
    url.basePath = '/root'
    return NextResponse.redirect(url)
  }

  if (url.pathname === '/redirect-with-basepath') {
    url.pathname = '/about'
    return NextResponse.rewrite(url)
  }
}
