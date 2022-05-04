import { NextResponse } from 'next/server'

export function middleware(request) {
  try {
    if (request.nextUrl.pathname === '/urls/relative-redirect') {
      return Response.redirect('/urls/urls-b')
    }

    if (request.nextUrl.pathname === '/urls/relative-next-redirect') {
      return NextResponse.redirect('/urls/urls-b')
    }

    if (request.nextUrl.pathname === '/urls/relative-next-rewrite') {
      return NextResponse.rewrite('/urls/urls-b')
    }
  } catch (error) {
    return new NextResponse(null, { headers: { error: error.message } })
  }
}
