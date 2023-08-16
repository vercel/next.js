import { NextResponse, URLPattern } from 'next/server'

export async function middleware(request) {
  const url = request.nextUrl

  // this is needed for tests to get the BUILD_ID
  if (url.pathname.startsWith('/_next/static/__BUILD_ID')) {
    return NextResponse.next()
  }

  if (request.headers.get('x-prerender-revalidate')) {
    return NextResponse.next({
      headers: { 'x-middleware': 'hi' },
    })
  }

  if (url.pathname === '/about/') {
    return NextResponse.rewrite(new URL('/about/a', request.url))
  }

  if (url.pathname === '/ssr-page/') {
    url.pathname = '/ssr-page-2'
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/') {
    url.pathname = '/ssg/first'
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/to-ssg/') {
    url.pathname = '/ssg/hello'
    url.searchParams.set('from', 'middleware')
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/sha/') {
    url.pathname = '/shallow'
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/rewrite-to-dynamic/') {
    url.pathname = '/blog/from-middleware'
    url.searchParams.set('some', 'middleware')
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/rewrite-to-config-rewrite/') {
    url.pathname = '/rewrite-3'
    url.searchParams.set('some', 'middleware')
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/redirect-to-somewhere/') {
    url.pathname = '/somewhere'
    return NextResponse.redirect(url, {
      headers: {
        'x-redirect-header': 'hi',
      },
    })
  }

  const original = new URL(request.url)
  return NextResponse.next({
    headers: {
      'req-url-path': `${original.pathname}${original.search}`,
      'req-url-basepath': request.nextUrl.basePath,
      'req-url-pathname': request.nextUrl.pathname,
      'req-url-query': request.nextUrl.searchParams.get('foo'),
      'req-url-locale': request.nextUrl.locale,
      'req-url-params':
        url.pathname !== '/static' ? JSON.stringify(params(request.url)) : '{}',
    },
  })
}

const PATTERNS = [
  [
    new URLPattern({ pathname: '/:locale/:id' }),
    ({ pathname }) => ({
      pathname: '/:locale/:id',
      params: pathname.groups,
    }),
  ],
  [
    new URLPattern({ pathname: '/:id' }),
    ({ pathname }) => ({
      pathname: '/:id',
      params: pathname.groups,
    }),
  ],
]

const params = (url) => {
  const input = url.split('?')[0]
  let result = {}

  for (const [pattern, handler] of PATTERNS) {
    const patternResult = pattern.exec(input)
    if (patternResult !== null && 'pathname' in patternResult) {
      result = handler(patternResult)
      break
    }
  }
  return result
}
