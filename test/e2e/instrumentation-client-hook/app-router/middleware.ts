import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Answer a navigation (RSC) request to /broken-nav with a response that
  // claims to be a flight payload but isn't. The navigation fails and falls
  // back to a full-page (MPA) navigation — the failed-navigation path of the
  // transition lifecycle. The full-page request (no RSC header) then falls
  // through to the normal 404.
  if (
    request.nextUrl.pathname === '/broken-nav' &&
    request.headers.has('rsc')
  ) {
    return new Response('this is not a flight payload', {
      headers: { 'content-type': 'text/x-component' },
    })
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
