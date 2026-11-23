import type { NextRequest } from 'next/server'

export function GET(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  return Response.json({
    pathname,
    secret: pathname === '/native-security/private',
  })
}
