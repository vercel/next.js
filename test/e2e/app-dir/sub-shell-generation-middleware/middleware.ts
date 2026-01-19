import { type NextRequest, NextResponse } from 'next/server'

export const middleware = (request: NextRequest) => {
  if (request.nextUrl.pathname.includes('/not-broken')) {
    const destination = new URL(
      '/rewrite' + request.nextUrl.pathname + request.nextUrl.search,
      request.url
    )

    return NextResponse.rewrite(destination)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/not-broken'],
}
