import { types } from 'node:util'

// This handler reads no request data. With Cache Components it is prerendered.
export function GET(request: Request) {
  const copy = new Request(request)

  return Response.json({
    isProxy: types.isProxy(request),
    method: copy.method,
  })
}
