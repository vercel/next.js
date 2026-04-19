import { NextRequest, NextResponse, NextProxy, ProxyConfig } from 'next/server'
import type { NextProxy as MiddlewareType } from 'next/server'

export function proxy(request: NextRequest): NextProxy {
  return NextResponse.next()
}

export const config: ProxyConfig = {
  matcher: '/api/:path*'
}

// Type usage in function parameter
function createMiddleware(): NextProxy {
  return (request: NextRequest) => NextResponse.next()
}

// Type alias using the imported type
type MyMiddleware = MiddlewareType