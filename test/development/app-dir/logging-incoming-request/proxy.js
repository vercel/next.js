import { NextResponse } from 'next/server'

export function proxy(request) {
  return NextResponse.redirect(new URL('/foo', request.url))
}

export const config = {
  matcher: '/proxy-redirect',
}
