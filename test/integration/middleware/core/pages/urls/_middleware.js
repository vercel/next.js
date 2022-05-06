import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request) {
  try {
    if (request.nextUrl.pathname === '/urls/relative-url') {
      new URL('/relative')
      return Response.next()
    }

    if (request.nextUrl.pathname === '/urls/relative-request') {
      await fetch(new Request('/urls/urls-b'))
      return Response.next()
    }

    if (request.nextUrl.pathname === '/urls/relative-redirect') {
      return Response.redirect('/urls/urls-b')
    }

    if (request.nextUrl.pathname === '/urls/relative-next-redirect') {
      return NextResponse.redirect('/urls/urls-b')
    }

    if (request.nextUrl.pathname === '/urls/relative-next-rewrite') {
      return NextResponse.rewrite('/urls/urls-b')
    }

    if (request.nextUrl.pathname === '/urls/relative-next-request') {
      await fetch(new NextRequest('/urls/urls-b'))
      return NextResponse.next()
    }
  } catch (error) {
    return new NextResponse(null, { headers: { error: error.message } })
  }
}
