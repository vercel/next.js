import { NextResponse } from 'next/server'

export function middleware(event) {
  const url = event.request.nextUrl
  if (url.pathname === '/redirect-with-basepath' && !url.basePath) {
    url.basePath = '/root'
    event.respondWith(NextResponse.redirect(url))
  }

  if (url.pathname === '/redirect-with-basepath') {
    url.pathname = '/about'
    event.respondWith(NextResponse.rewrite(url))
  }
}
