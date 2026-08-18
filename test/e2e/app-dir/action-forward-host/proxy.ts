import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  if (
    request.headers.get('x-action-forwarded') === '1' &&
    request.headers.get('x-test-forwarded-response') === 'unexpected'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/unexpected-forwarded-response'
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}
