import { NextProxy, NextResponse, ProxyConfig } from 'next/server'

export const proxy: NextProxy = function (request) {
  if (request.nextUrl.pathname === '/static') {
    return new NextResponse(null, {
      headers: {
        data: 'hello from proxy',
        'req-url-basepath': request.nextUrl.basePath,
        'req-url-pathname': request.nextUrl.pathname,
        'req-url-query': request.nextUrl.searchParams.get('foo') || '',
        'req-url-locale': request.nextUrl.locale,
      },
    })
  }
}

export const config = {
  matcher: ['/:path*'],
  regions: [],
} satisfies ProxyConfig
