import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/search-params/target-page')) {
    const searchParam = request.nextUrl.searchParams.get('searchParam')
    if (
      searchParam === 'rewritesToANewSearchParam' ||
      searchParam === 'alsoRewritesToThatSameSearchParam'
    ) {
      return NextResponse.rewrite(
        new URL(
          '/search-params/target-page?searchParam=rewrittenSearchParam',
          request.url
        )
      )
    }
  }

  if (request.nextUrl.pathname.startsWith('/search-params-with-greeting')) {
    return NextResponse.rewrite(
      new URL('/search-params?greeting=hello', request.url)
    )
  }

  if (request.nextUrl.pathname.startsWith('/search-params-with-no-greeting')) {
    return NextResponse.rewrite(new URL('/search-params', request.url))
  }
}
