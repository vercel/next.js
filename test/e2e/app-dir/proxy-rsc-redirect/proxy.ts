import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  switch (request.nextUrl.pathname) {
    case '/redirect':
      return NextResponse.redirect(new URL('/target?foo=bar', request.url))
    case '/external':
      return NextResponse.redirect('https://example.com/target')
    case '/redirect-with-rsc':
      return NextResponse.redirect(
        new URL('/target?_rsc=destination', request.url)
      )
    default:
      return NextResponse.next()
  }
}
