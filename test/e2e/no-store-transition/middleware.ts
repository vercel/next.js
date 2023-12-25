import { NextResponse, NextRequest } from 'next/server'

export const config = {
  matcher: ['/private/:path*'],
}

export async function middleware(request: NextRequest) {
  const hasPrivateAccess = request.cookies.get('has-private-access')?.value
  if (!hasPrivateAccess) {
    return NextResponse.redirect(new URL('/mock', request.url))
  }

  return NextResponse.next()
}
