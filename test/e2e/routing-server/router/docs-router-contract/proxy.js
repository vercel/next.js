import { NextResponse } from 'next/server'

export function proxy(request) {
  const pathname = request.nextUrl.pathname
  if (
    pathname === '/protected' &&
    request.headers.get('x-contract-authorized') !== 'yes'
  ) {
    return NextResponse.json(
      { destination: 'proxy-denied' },
      {
        status: 401,
        headers: { 'x-contract-proxy': 'denied' },
      }
    )
  }
  // If config redirects did not terminate first, this competing response wins.
  if (pathname === '/order/redirect' || pathname === '/order/proxy') {
    return NextResponse.json(
      { destination: 'proxy' },
      {
        status: 202,
        headers: { 'x-contract-proxy': 'ran' },
      }
    )
  }
  const headers = new Headers(request.headers)
  headers.set('x-contract-proxy', 'ran')
  const response = NextResponse.next({ request: { headers } })
  response.headers.set('x-contract-proxy', 'ran')
  return response
}

export const config = {
  matcher:
    '/((?!api|_next/data|_next/static|_next/image|favicon.ico|without-proxy).*)',
}
