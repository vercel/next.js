import { NextResponse } from 'next/server'

export async function middleware(request) {
  const url = request.nextUrl

  if (url.pathname === '/rewrites/rewrite-to-ab-test') {
    let bucket = request.cookies.bucket
    if (!bucket) {
      bucket = Math.random() >= 0.5 ? 'a' : 'b'
      const response = NextResponse.rewrite(`/rewrites/${bucket}`)
      response.cookie('bucket', bucket)
      return response
    }

    return NextResponse.rewrite(`/rewrites/${bucket}`)
  }

  if (url.pathname === '/rewrites/rewrite-me-to-about') {
    return NextResponse.rewrite('/rewrites/about')
  }

  if (url.pathname === '/rewrites/rewrite-me-to-vercel') {
    return NextResponse.rewrite('https://vercel.com')
  }

  if (url.pathname === '/rewrites/rewrite-me-without-hard-navigation') {
    url.pathname = '/rewrites/about'
    url.searchParams.set('middleware', 'foo')
    return NextResponse.rewrite(url)
  }
}
