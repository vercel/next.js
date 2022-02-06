import { NextResponse, NextRequest } from 'next/server'

export function middleware(request) {
  try {
    if (request.nextUrl.pathname === '/urls/relative-url') {
      return NextResponse.json({ message: String(new URL('/relative')) })
    }

    if (request.nextUrl.pathname === '/urls/relative-request') {
      return fetch(new Request('/urls/urls-b'))
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
      return fetch(new NextRequest('/urls/urls-b'))
    }
  } catch (error) {
    return NextResponse.json({
      error: {
        message: error.message,
      },
    })
  }
}
