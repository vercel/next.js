import { NextMiddleware, NextResponse, URLPattern } from 'next/server'

export const middleware: NextMiddleware = function (request) {
  const pattern = new URLPattern({
    pathname: '/:path',
  })
  console.log(pattern.test(request.nextUrl.pathname))

  if (request.nextUrl.pathname === '/static') {
    return new NextResponse(null, {
      headers: {
        data: 'hello from middleware',
        'req-url-basepath': request.nextUrl.basePath,
        'req-url-pathname': request.nextUrl.pathname,
        'req-url-query': request.nextUrl.searchParams.get('foo') || '',
        'req-url-locale': request.nextUrl.locale,
      },
    })
  }
}
