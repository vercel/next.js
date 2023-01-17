import { NextResponse } from 'next/server'

export async function middleware(request) {
  const url = request.nextUrl

  // this is needed for tests to get the BUILD_ID
  if (url.pathname.startsWith('/_next/static/__BUILD_ID')) {
    return NextResponse.next()
  }

  if (url.pathname === '/old-home') {
    if (url.searchParams.get('override') === 'external') {
      return Response.redirect('https://example.vercel.sh')
    } else {
      url.pathname = '/new-home'
      return Response.redirect(url)
    }
  }

  if (url.searchParams.get('foo') === 'bar') {
    url.pathname = '/new-home'
    url.searchParams.delete('foo')
    return Response.redirect(url)
  }

  // Chained redirects
  if (url.pathname === '/redirect-me-alot') {
    url.pathname = '/redirect-me-alot-2'
    return Response.redirect(url)
  }

  if (url.pathname === '/redirect-me-alot-2') {
    url.pathname = '/redirect-me-alot-3'
    return Response.redirect(url)
  }

  if (url.pathname === '/redirect-me-alot-3') {
    url.pathname = '/redirect-me-alot-4'
    return Response.redirect(url)
  }

  if (url.pathname === '/redirect-me-alot-4') {
    url.pathname = '/redirect-me-alot-5'
    return Response.redirect(url)
  }

  if (url.pathname === '/redirect-me-alot-5') {
    url.pathname = '/redirect-me-alot-6'
    return Response.redirect(url)
  }

  if (url.pathname === '/redirect-me-alot-6') {
    url.pathname = '/redirect-me-alot-7'
    return Response.redirect(url)
  }

  if (url.pathname === '/redirect-me-alot-7') {
    url.pathname = '/new-home'
    return Response.redirect(url)
  }

  // Infinite loop
  if (url.pathname === '/infinite-loop') {
    url.pathname = '/infinite-loop-1'
    return Response.redirect(url)
  }

  if (url.pathname === '/infinite-loop-1') {
    url.pathname = '/infinite-loop'
    return Response.redirect(url)
  }

  if (url.pathname === '/to') {
    url.pathname = url.searchParams.get('pathname')
    url.searchParams.delete('pathname')
    return Response.redirect(url)
  }

  if (url.pathname === '/with-fragment') {
    console.log(String(new URL('/new-home#fragment', url)))
    return Response.redirect(new URL('/new-home#fragment', url))
  }
}
