import type { NextRequest } from 'next/server'

export const dynamic = 'force-static'

export function GET(request: NextRequest) {
  const copy = new Request(request)
  const clone = request.clone()

  return Response.json({
    method: copy.method + ' ' + clone.method,
    header: request.headers.get('x-test'),
    search: request.nextUrl.search,
  })
}
