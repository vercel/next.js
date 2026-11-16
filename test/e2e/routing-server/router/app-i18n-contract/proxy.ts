import { NextRequest, NextResponse } from 'next/server'

const locales = ['en-US', 'nl-NL', 'nl']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (
    locales.some(
      (locale) =>
        pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
    )
  ) {
    return NextResponse.next()
  }

  // A small deterministic application policy, not a built-in App i18n option.
  const requestedLanguages = (request.headers.get('accept-language') ?? '')
    .split(',')
    .map((language) => language.split(';')[0].trim())
  const locale =
    requestedLanguages.find((language) => locales.includes(language)) ?? 'en-US'
  request.nextUrl.pathname = `/${locale}${pathname}`
  return NextResponse.redirect(request.nextUrl)
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] }
