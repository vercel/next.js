import { NextResponse } from 'next/server'

const PUBLIC_FILE = /\.(.*)$/

/**
 * @param {import('next/server').NextRequest} request
 */
export async function middleware(request) {
  const url = request.nextUrl

  // this is needed for tests to get the BUILD_ID
  if (url.pathname.startsWith('/_next/static/__BUILD_ID')) {
    return NextResponse.next()
  }

  if (url.pathname.includes('/to/some/404/path')) {
    return NextResponse.next({
      'x-matched-path': '/404',
    })
  }

  if (url.pathname.includes('/middleware-external-rewrite-body')) {
    return NextResponse.rewrite(
      'https://next-data-api-endpoint.vercel.app/api/echo-body'
    )
  }

  if (url.pathname.includes('/rewrite-to-static')) {
    request.nextUrl.pathname = '/static-ssg/post-1'
    return NextResponse.rewrite(request.nextUrl)
  }

  if (url.pathname.includes('/fallback-true-blog/rewritten')) {
    request.nextUrl.pathname = '/about'
    return NextResponse.rewrite(request.nextUrl)
  }

  if (url.pathname.startsWith('/about') && url.searchParams.has('override')) {
    const isExternal = url.searchParams.get('override') === 'external'
    return NextResponse.rewrite(
      isExternal
        ? 'https://example.vercel.sh'
        : new URL('/ab-test/a', request.url)
    )
  }

  if (url.pathname === '/rewrite-to-beforefiles-rewrite') {
    url.pathname = '/beforefiles-rewrite'
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/rewrite-to-afterfiles-rewrite') {
    url.pathname = '/afterfiles-rewrite'
    return NextResponse.rewrite(url)
  }

  if (url.pathname.startsWith('/to-blog')) {
    const slug = url.pathname.split('/').pop()
    url.pathname = `/fallback-true-blog/${slug}`
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/rewrite-to-ab-test') {
    let bucket = request.cookies.get('bucket')
    if (!bucket) {
      bucket = Math.random() >= 0.5 ? 'a' : 'b'
      url.pathname = `/ab-test/${bucket}`
      const response = NextResponse.rewrite(url)
      response.cookies.set('bucket', bucket, { maxAge: 10 })
      return response
    }

    url.pathname = `/${bucket}`
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/rewrite-me-to-about') {
    url.pathname = '/about'
    return NextResponse.rewrite(url, {
      headers: { 'x-rewrite-target': String(url) },
    })
  }

  if (url.pathname === '/rewrite-me-with-a-colon') {
    url.pathname = '/with:colon'
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/colon:here') {
    url.pathname = '/no-colon-here'
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/rewrite-me-to-vercel') {
    return NextResponse.rewrite('https://example.vercel.sh')
  }

  if (url.pathname === '/clear-query-params') {
    const allowedKeys = ['allowed']
    for (const key of [...url.searchParams.keys()]) {
      if (!allowedKeys.includes(key)) {
        url.searchParams.delete(key)
      }
    }
    return NextResponse.rewrite(url)
  }

  if (
    url.pathname === '/rewrite-me-without-hard-navigation' ||
    url.searchParams.get('path') === 'rewrite-me-without-hard-navigation'
  ) {
    url.searchParams.set('middleware', 'foo')
    url.pathname = request.cookies.has('about-bypass')
      ? '/about-bypass'
      : '/about'

    return NextResponse.rewrite(url, {
      headers: { 'x-middleware-cache': 'no-cache' },
    })
  }

  if (url.pathname.endsWith('/dynamic-replace')) {
    url.pathname = '/dynamic-fallback/catch-all'
    return NextResponse.rewrite(url)
  }

  if (url.pathname.startsWith('/country')) {
    const locale = url.searchParams.get('my-locale')
    if (locale) {
      url.locale = locale
    }

    const country = url.searchParams.get('country') || 'us'
    if (!PUBLIC_FILE.test(url.pathname) && !url.pathname.includes('/api/')) {
      url.pathname = `/country/${country}`
      return NextResponse.rewrite(url)
    }
  }

  if (url.pathname.startsWith('/i18n')) {
    url.searchParams.set('locale', url.locale)
    return NextResponse.rewrite(url)
  }

  return NextResponse.rewrite(request.nextUrl)
}
