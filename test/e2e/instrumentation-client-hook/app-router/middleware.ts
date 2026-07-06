import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Delay every request for /slow before a single byte (headers included) is
  // sent, so a navigation to it provably cannot settle for 2s. The delay
  // must live here rather than in the page: an in-page `await` only delays
  // the page's own subtree, while the router tree arrives in the first
  // flight rows and the navigation could commit with a pending Suspense
  // hole.
  if (request.nextUrl.pathname === '/slow') {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    return
  }

  // Rewrite /rewrite-source to /rewrite-target, keeping the user's search
  // params and adding one of our own, so tests can observe how the transition
  // events report a rewritten pathname and post-rewrite search params.
  if (request.nextUrl.pathname === '/rewrite-source') {
    const url = request.nextUrl.clone()
    url.pathname = '/rewrite-target'
    url.searchParams.set('internal', 'from-middleware')
    return NextResponse.rewrite(url)
  }
}
