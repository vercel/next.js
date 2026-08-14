import { NextRequest, NextResponse } from 'next/server'

const LOCALE_DOMAINS: Record<string, string> = {
  'en.example.local': 'en-US',
  'nl.example.local': 'nl-NL',
}
const DEFAULT_LOCALE = 'en-US'
const LOCALES = ['en-US', 'nl-NL']

function getLocaleFromHost(host: string | null): string {
  if (!host) return DEFAULT_LOCALE
  const hostname = host.split(':')[0]
  return LOCALE_DOMAINS[hostname] || DEFAULT_LOCALE
}

// `request.nextUrl.pathname` is already basePath-stripped here, so the matcher
// and rewrite are written without the basePath.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/') {
    return NextResponse.next()
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const hasLocale = LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
  )
  if (hasLocale) {
    return NextResponse.next()
  }

  const locale = getLocaleFromHost(request.headers.get('host'))
  const url = request.nextUrl.clone()
  url.pathname = `/${locale}${pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/test/:path*'],
}
