/* global globalThis */

import { NextResponse } from 'next/server'

export function middleware(request) {
  const url = request.nextUrl

  if (url.pathname.endsWith('/globalthis')) {
    return new NextResponse(JSON.stringify(Object.keys(globalThis)), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    })
  }

  return new Response(null, {
    headers: {
      'req-url-basepath': request.nextUrl.basePath,
      'req-url-pathname': request.nextUrl.pathname,
      'req-url-params': JSON.stringify(request.page.params),
      'req-url-page': request.page.name,
      'req-url-query': request.nextUrl.searchParams.get('foo'),
      'req-url-locale': request.nextUrl.locale,
    },
  })
}
