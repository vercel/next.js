import { NextRequest, NextResponse } from 'next/server'

// Simulates what might happen if a proxy or firewall modifies the
// request based on a condition that changes after the prefetch but before
// the actual navigation.
//
// The proxy modifies the request based on special search parameters, but only
// during a navigation — not during a prefetch.
export const config = {
  matcher: [
    {
      source: '/:path*',

      // Exclude prefetch requests
      missing: [{ type: 'header', key: 'Next-Router-Prefetch' }],
    },
  ],
}

export default function proxy(req: NextRequest) {
  const mismatchRedirect = req.nextUrl.searchParams.get('mismatch-redirect')
  if (mismatchRedirect) {
    // Redirect to the given URL.
    return NextResponse.redirect(new URL(mismatchRedirect, req.url))
  }

  const mismatchRewrite = req.nextUrl.searchParams.get('mismatch-rewrite')
  if (mismatchRewrite) {
    // Rewrite to the given URL.
    return NextResponse.rewrite(new URL(mismatchRewrite, req.url))
  }
}
