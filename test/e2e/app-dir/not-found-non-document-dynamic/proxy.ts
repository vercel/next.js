import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/rewritten-not-found') {
    return NextResponse.rewrite(new URL('/_not-found', request.url), {
      status: 404,
    })
  }
}
