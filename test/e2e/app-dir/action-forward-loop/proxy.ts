import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Unconditionally rewrites `/forward-target-route` to `/no-action-route`. This
// reproduces the scenario from vercel/next.js#84504 where rewrites applied to
// a forwarded Server Action request can cause infinite forwarding: the
// forwarded request lands on `/forward-target-route`, gets rewritten to
// `/no-action-route` (which has no entry in the action's workers manifest),
// the receiving worker tries to forward back to `/forward-target-route`, which
// gets rewritten again, and so on.
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/forward-target-route') {
    const url = request.nextUrl.clone()
    url.pathname = '/no-action-route'
    return NextResponse.rewrite(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/forward-target-route',
}
