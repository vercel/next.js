import { NextResponse } from 'next/server'

/**
 * @param {import('next/server').NextRequest} request
 */
export async function proxy(request) {
  if (request.nextUrl.pathname === '/test') {
    return NextResponse.rewrite(new URL('/rewritten', request.url))
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next({
      headers: {
        'x-from-proxy': 'hello-from-proxy',
      },
    })
  }

  return NextResponse.next({
    headers: {
      'x-from-proxy': 'hello-from-proxy',
    },
  })
}
