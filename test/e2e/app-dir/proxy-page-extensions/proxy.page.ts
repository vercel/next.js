import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: new Headers({
        ...Object.fromEntries(request.headers),
        'x-from-proxy': 'hello-from-proxy',
      }),
    },
  })
  // Expose a response header so route-level tests can verify the proxy
  // actually ran without forcing the page to opt into dynamic rendering.
  response.headers.set('x-proxy-ran', 'true')
  return response
}
