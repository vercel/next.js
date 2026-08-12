import { NextResponse, type NextRequest } from 'next/server'

// Injects a locale as a leading path segment, so the rendered pathname always
// has one more segment than the requested one. This is what i18n libraries do
// when the default locale is hidden from the URL (e.g. next-intl's
// `localePrefix: 'as-needed'`).
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/en')) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = `/en${pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!_next|_vercel|.*\\..*).*)'],
}
