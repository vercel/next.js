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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let the Pages Router handle the root path.
  if (pathname === '/') {
    return NextResponse.next()
  }

  // Skip Next.js internals, API routes and files with extensions.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // If the path is already locale-prefixed, leave it alone.
  const hasLocale = LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
  )
  if (hasLocale) {
    return NextResponse.next()
  }

  // Rewrite e.g. `/test` -> `/nl-NL/test` so the App Router `[lang]` segment
  // can capture the locale derived from the domain.
  const locale = getLocaleFromHost(request.headers.get('host'))
  const url = request.nextUrl.clone()
  url.pathname = `/${locale}${pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/test/:path*'],
}
