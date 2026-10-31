import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Only rewrite action POSTs so the user can still GET the page to see the
// button. The receiving worker is /without-action, which does not bundle the
// action — so without the loop guard, the worker forwards the action back to
// /with-action, which is rewritten here again, and so on.
export function proxy(request: NextRequest) {
  if (
    request.method === 'POST' &&
    request.nextUrl.pathname === '/with-action'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/without-action'
    return NextResponse.rewrite(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/with-action',
}
