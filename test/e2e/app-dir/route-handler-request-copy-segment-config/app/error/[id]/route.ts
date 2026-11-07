import { types } from 'node:util'
import type { NextRequest } from 'next/server'

export const dynamic = 'error'

export function GET(request: NextRequest) {
  const copy = new Request(request)
  const clone = request.clone()

  let error: string | null = null
  try {
    request.headers.get('x-test')
  } catch (err) {
    error = (err as Error).message
  }

  return Response.json({
    // Node.js 24 does not copy a Proxy of a request, Node.js 20 does.
    isProxy: types.isProxy(request) || types.isProxy(clone),
    method: copy.method + ' ' + clone.method,
    error,
  })
}
