import { NextRequest, NextResponse } from 'next/server'

export const config = {
  matcher: '/redirect-target',
}

// Redirects /redirect-target to /target, to test that a prepared navigation
// whose request is redirected doesn't navigate on its own.
export default function proxy(req: NextRequest) {
  return NextResponse.redirect(new URL('/target', req.url))
}
