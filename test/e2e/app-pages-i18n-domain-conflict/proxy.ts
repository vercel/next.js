import { NextRequest, NextResponse } from 'next/server'

// Domain to locale mapping
const LOCALE_DOMAINS = {
  'en.example.local': 'en-US',
  'nl.example.local': 'nl-NL',
} as const

const DEFAULT_LOCALE = 'en-US'
const LOCALES = ['en-US', 'nl-NL'] as const

type Locale = (typeof LOCALES)[number]

function getLocaleFromHost(hostname: string): Locale {
  // Remove port if present
  const domain = hostname.split(':')[0]

  // Find matching domain in configuration
  const locale = LOCALE_DOMAINS[domain as keyof typeof LOCALE_DOMAINS]

  return locale || DEFAULT_LOCALE
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow Pages Router to handle root path
  if (pathname === '/') {
    return NextResponse.next()
  }

  // Skip static assets, API routes, and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Check if pathname already has a locale prefix
  const pathnameHasLocale = LOCALES.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  )

  if (pathnameHasLocale) {
    return NextResponse.next()
  }

  // Get locale from domain
  const locale = getLocaleFromHost(request.headers.get('host') || '')

  // Rewrite to include locale in pathname for App Router
  // e.g., /test -> /nl-NL/test
  const newUrl = request.nextUrl.clone()
  newUrl.pathname = `/${locale}${pathname}`

  return NextResponse.rewrite(newUrl)
}

export const config = {
  matcher: ['/test/:path*'],
}
