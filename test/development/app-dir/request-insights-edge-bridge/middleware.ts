import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = await fetch(new URL('/api/edge-causal/proxy', request.url))
  const payload = (await response.json()) as { causalCookieVisible: boolean }
  if (payload.causalCookieVisible) {
    throw new Error('Request Insights causal cookie reached userland')
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-proxy-fetch-status', String(response.status))
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: '/edge-proxy',
}
