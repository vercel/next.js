import { NextResponse, type NextRequest } from 'next/server'
export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers)
  headers.set(
    'x-proxy-count',
    String(Number(headers.get('x-proxy-count') || 0) + 1)
  )
  if (req.nextUrl.pathname === '/proxy-target') {
    return NextResponse.rewrite(new URL('/native/proxy', req.url), {
      request: { headers },
    })
  }
  const response = NextResponse.next({ request: { headers } })
  response.headers.append('Vary', 'X-Proxy')
  response.headers.append('Link', '</proxy.css>; rel=preload')
  return response
}
export const config = {
  matcher: ['/native/:path*', '/rewritten/:path*', '/proxy-target'],
}
