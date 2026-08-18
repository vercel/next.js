import { NextRequest, NextResponse } from 'next/server'

const localeByHost = new Map([
  ['en.example.local', 'en-US'],
  ['nl.example.local', 'nl-NL'],
])

export function proxy(request: NextRequest) {
  const hostname = request.headers.get('host')?.split(':', 1)[0] || ''
  const locale = localeByHost.get(hostname) || 'en-US'

  return NextResponse.rewrite(new URL(`/${locale}/test`, request.url))
}

export const config = {
  matcher: '/test',
}
