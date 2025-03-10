import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (
    pathname.startsWith('/with-middleware/search-params') &&
    !pathname.includes('someValue')
  ) {
    const newPathname = pathname.replace(
      '/with-middleware/search-params',
      '/with-middleware/search-params/someValue'
    )
    console.log('performing redirect')
    return NextResponse.redirect(
      new URL(`${newPathname}${search}`, request.url)
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/with-middleware/search-params',
}
