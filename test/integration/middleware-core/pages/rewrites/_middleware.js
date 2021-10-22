import { NextResponse } from 'next/server'

export function middleware(event) {
  const url = event.request.nextUrl

  if (url.pathname === '/rewrites/rewrite-to-ab-test') {
    let bucket = event.request.cookies.bucket
    if (!bucket) {
      bucket = Math.random() >= 0.5 ? 'a' : 'b'
      const response = NextResponse.rewrite(`/rewrites/${bucket}`)
      response.cookie('bucket', bucket)
      return event.respondWith(response)
    }

    return event.respondWith(NextResponse.rewrite(`/rewrites/${bucket}`))
  }

  if (url.pathname === '/rewrites/rewrite-me-to-about') {
    return event.respondWith(NextResponse.rewrite('/rewrites/about'))
  }

  if (url.pathname === '/rewrites/rewrite-me-to-vercel') {
    return event.respondWith(NextResponse.rewrite('https://vercel.com'))
  }

  if (url.pathname === '/rewrites/rewrite-me-without-hard-navigation') {
    url.pathname = '/rewrites/about'
    url.searchParams.set('middleware', 'foo')
    event.respondWith(NextResponse.rewrite(url))
  }
}
