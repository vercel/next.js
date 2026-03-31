import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Rewrite /rewritten/[slug] to /actual/[slug]
  // This creates a mismatch between URL and route structure that should
  // mark the route as having a dynamic rewrite.
  if (pathname.startsWith('/rewritten/')) {
    const slug = pathname.replace('/rewritten/', '')
    const url = request.nextUrl.clone()
    url.pathname = `/actual/${slug}`
    return NextResponse.rewrite(url)
  }

  // Rewrite /search-rewrite?v=alpha to /rewrite-alpha
  // Rewrite /search-rewrite?v=beta to /rewrite-beta
  // This tests that search param rewrites are correctly detected.
  // The destination pages are fully static, so if we incorrectly use a cached
  // pattern, we'd show the wrong content.
  if (pathname === '/search-rewrite') {
    const v = request.nextUrl.searchParams.get('v')
    const url = request.nextUrl.clone()
    url.pathname = v === 'beta' ? '/rewrite-beta' : '/rewrite-alpha'
    url.searchParams.delete('v')
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/rewritten/:path*', '/search-rewrite'],
}
