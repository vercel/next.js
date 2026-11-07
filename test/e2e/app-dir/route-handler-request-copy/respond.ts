import type { NextRequest } from 'next/server'

/**
 * Responds with what the route handler reads from the request that it received
 * and from a copy of that request.
 */
export async function respond(request: NextRequest, copy: Request) {
  return Response.json({
    request: {
      header: request.headers.get('x-test'),
      search: request.nextUrl.search,
    },
    copy: {
      header: copy.headers.get('x-test'),
      body: await copy.text(),
    },
  })
}
