import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const destination = request.nextUrl.clone()
  destination.pathname = '/sitemap/region=default&locale=en'

  return NextResponse.rewrite(destination)
}

export const config = {
  matcher: '/sitemap',
}
