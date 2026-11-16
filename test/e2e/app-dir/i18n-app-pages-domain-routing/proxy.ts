import { NextRequest, NextResponse } from 'next/server'

const localeByHost = new Map([
  ['en.example.local', 'en-US'],
  ['nl.example.local', 'nl-NL'],
])

export function proxy(request: NextRequest) {
  const hostname = request.headers.get('host')?.split(':', 1)[0] || ''
  const locale = localeByHost.get(hostname) || 'en-US'

  if (request.nextUrl.pathname === '/rewrite-plain') {
    return NextResponse.rewrite(new URL('/plain/123', request.url))
  }

  if (request.nextUrl.pathname === '/rewrite-plain-clone') {
    const url = request.nextUrl.clone()
    url.pathname = '/plain/123'
    return NextResponse.rewrite(url)
  }

  if (request.nextUrl.pathname === '/rewrite-localized') {
    return NextResponse.rewrite(new URL(`/${locale}/plain/123`, request.url))
  }

  return NextResponse.rewrite(new URL(`/${locale}/test`, request.url))
}

export const config = {
  matcher: [
    '/test',
    '/rewrite-plain',
    '/rewrite-plain-clone',
    '/rewrite-localized',
  ],
}
