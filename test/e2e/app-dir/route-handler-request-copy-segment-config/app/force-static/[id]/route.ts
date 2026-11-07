import { types } from 'node:util'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-static'

export function GET(request: NextRequest) {
  const copy = new Request(request)
  const clone = request.clone()

  return Response.json({
    // Node.js 24 does not copy a Proxy of a request, Node.js 20 does.
    isProxy: types.isProxy(request) || types.isProxy(clone),
    method: copy.method + ' ' + clone.method,
    header: request.headers.get('x-test'),
    search: request.nextUrl.search,
  })
}
