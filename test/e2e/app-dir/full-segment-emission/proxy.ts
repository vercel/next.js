import { NextRequest, NextResponse } from 'next/server'
export function proxy(request: NextRequest) {
  if (request.headers.get('rsc') === '1') {
    return NextResponse.rewrite(
      new URL('/full-segment-emission/static/known', request.url)
    )
  }
  return NextResponse.next()
}
export const config = { matcher: '/full-segment-emission/static/rewritten' }
