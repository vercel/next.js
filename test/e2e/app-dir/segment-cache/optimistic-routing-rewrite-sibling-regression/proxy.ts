import { NextResponse, type NextRequest } from 'next/server'

const LOCALES = ['de', 'en']

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (
    LOCALES.some(
      (locale) =>
        pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
    )
  ) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = `/de${pathname === '/' ? '' : pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!_next|_vercel|.*\\..*).*)'],
}
