import { NextRequest, NextResponse } from 'next/server'

// Simulates a proxy/firewall that modifies the request based on a condition
// that changes after the prefetch but before the actual navigation. The proxy
// only acts during a navigation — not during a prefetch — so the prefetched
// tree is for the requested route but the navigation resolves to a different
// one, which is what produces a router-transition route mismatch.
export const config = {
  matcher: [
    {
      source: '/:path*',
      // Exclude prefetch requests.
      missing: [{ type: 'header', key: 'Next-Router-Prefetch' }],
    },
  ],
}

export default function proxy(req: NextRequest) {
  const mismatchRewrite = req.nextUrl.searchParams.get('mismatch-rewrite')
  if (mismatchRewrite) {
    return NextResponse.rewrite(new URL(mismatchRewrite, req.url))
  }
}
