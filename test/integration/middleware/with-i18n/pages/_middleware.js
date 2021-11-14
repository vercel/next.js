import { NextResponse } from 'next/server'

const PUBLIC_FILE = /\.(.*)$/

export function middleware(req) {
  const locale = req.nextUrl.searchParams.get('my-locale')
  const country = req.nextUrl.searchParams.get('country') || 'us'

  if (locale) {
    req.nextUrl.locale = locale
  }

  if (
    !PUBLIC_FILE.test(req.nextUrl.pathname) &&
    !req.nextUrl.pathname.includes('/api/')
  ) {
    req.nextUrl.pathname = `/test/${country}`
    return NextResponse.rewrite(req.nextUrl)
  }
}
