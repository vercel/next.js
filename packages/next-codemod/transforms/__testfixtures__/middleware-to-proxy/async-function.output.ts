import { NextResponse, NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const response = await fetch('/api/auth')
  return NextResponse.redirect(new URL('/home', request.url))
}

export const config = {
  matcher: '/about/:path*',
}