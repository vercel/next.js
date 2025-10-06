import { NextResponse } from 'next/server'

export default function middleware(request) {
  const res = NextResponse.rewrite(new URL('/', request.url))
  res.headers.set('X-From-Middleware', 'true')
  return res
}

export const config = {
  matcher: [
    { source: '/source-match' },
    {
      source: '/has-match-1',
      has: [
        {
          type: 'header',
          key: 'x-my-header',
          value: '(?<myHeader>.*)',
        },
      ],
    },
    {
      source: '/has-match-2',
      has: [
        {
          type: 'query',
          key: 'my-query',
        },
      ],
    },
    {
      source: '/has-match-3',
      has: [
        {
          type: 'cookie',
          key: 'loggedIn',
          value: '(?<loggedIn>true)',
        },
      ],
    },
    {
      source: '/has-match-4',
      has: [
        {
          type: 'host',
          value: 'example.com',
        },
      ],
    },
    {
      source: '/has-match-5',
      has: [
        {
          type: 'header',
          key: 'hasParam',
          value: 'with-params',
        },
      ],
    },
    {
      source: '/missing-match-1',
      missing: [
        {
          type: 'header',
          key: 'hello',
          value: '(.*)',
        },
      ],
    },
    {
      source: '/missing-match-2',
      missing: [
        {
          type: 'query',
          key: 'test',
          value: 'value',
        },
      ],
    },
    {
      source:
        '/((?!api|monitoring|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest|icon|source-match|has-match-1|has-match-2|has-match-3|has-match-4|has-match-5|missing-match-1|missing-match-2|routes).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
