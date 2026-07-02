import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
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
