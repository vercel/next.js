import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone()

  if (url.pathname === '/about') {
    // Get the external server port from environment or default
    const externalPort = process.env.EXTERNAL_SERVER_PORT || '3001'
    const externalUrl = `http://localhost:${externalPort}/about`

    console.log('Middleware rewriting /about to:', externalUrl)

    // Rewrite to external server
    return NextResponse.rewrite(externalUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/about'],
}
