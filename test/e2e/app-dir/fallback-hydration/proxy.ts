import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone()
  const slug = url.pathname.split('/').pop()
  let locale = 'en'
  const rawQuery = url.search
    .slice(1)
    .split('&')
    .filter((pair) => !pair.startsWith('_rsc='))
    .join('&')
  if (
    url.searchParams.get('raw') === 'check' &&
    rawQuery !==
      'raw=check&value=a%20b&literal=~&plus=+&encoded=%2B&repeat=one&repeat=two'
  ) {
    locale = 'de'
  }
  if (request.headers.get('rsc') === '1') {
    const mismatch = url.searchParams.get('mismatch')
    if (mismatch === 'redirect') {
      url.pathname = '/fallback-hydration/de/products/redirected'
      url.searchParams.delete('mismatch')
      url.searchParams.set('value', 'redirected')
      return NextResponse.redirect(url)
    }
    if (mismatch === 'compatible-redirect') {
      url.pathname = `/fallback-hydration/en/products/${slug}`
      url.searchParams.delete('mismatch')
      return NextResponse.redirect(url)
    }
    if (mismatch === 'locale' || mismatch === 'third') {
      locale = 'de'
    }
    if (
      mismatch === 'third' &&
      !request.headers.has('next-router-segment-prefetch')
    ) {
      locale = 'fr'
    }
  }
  const section =
    request.headers.get('rsc') === '1' &&
    url.searchParams.get('mismatch') === 'route'
      ? 'articles'
      : 'products'
  url.pathname = `/fallback-hydration/${locale}/${section}/${slug}`
  return NextResponse.rewrite(url)
}

export const config = { matcher: '/fallback-hydration/offer/:path*' }
