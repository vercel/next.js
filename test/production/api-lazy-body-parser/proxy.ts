import { NextResponse, type NextRequest } from 'next/server'

// Forwards the request with a new set of headers. The request headers that are
// not in that set are removed, `content-length` included.
export function proxy(request: NextRequest) {
  return NextResponse.next({
    request: {
      headers: new Headers({
        'content-type': request.headers.get('content-type') ?? 'text/plain',
      }),
    },
  })
}

export const config = {
  matcher: '/api/behind-proxy',
}
