export async function middleware(request) {
  const url = request.nextUrl

  if (url.searchParams.get('foo') === 'bar') {
    url.pathname = '/redirects/new-home'
    url.searchParams.delete('foo')
    return Response.redirect(url)
  }

  if (url.pathname === '/redirects/old-home') {
    url.pathname = '/redirects/new-home'
    return Response.redirect(url)
  }

  // Chained redirects
  if (url.pathname === '/redirects/redirect-me-alot') {
    url.pathname = '/redirects/redirect-me-alot-2'
    return Response.redirect(url)
  }

  if (url.pathname === '/redirects/redirect-me-alot-2') {
    url.pathname = '/redirects/redirect-me-alot-3'
    return Response.redirect(url)
  }

  if (url.pathname === '/redirects/redirect-me-alot-3') {
    url.pathname = '/redirects/redirect-me-alot-4'
    return Response.redirect(url)
  }

  if (url.pathname === '/redirects/redirect-me-alot-4') {
    url.pathname = '/redirects/redirect-me-alot-5'
    return Response.redirect(url)
  }

  if (url.pathname === '/redirects/redirect-me-alot-5') {
    url.pathname = '/redirects/redirect-me-alot-6'
    return Response.redirect(url)
  }

  if (url.pathname === '/redirects/redirect-me-alot-6') {
    url.pathname = '/redirects/redirect-me-alot-7'
    return Response.redirect(url)
  }

  if (url.pathname === '/redirects/redirect-me-alot-7') {
    url.pathname = '/redirects/new-home'
    return Response.redirect(url)
  }

  // Infinite loop
  if (url.pathname === '/redirects/infinite-loop') {
    url.pathname = '/redirects/infinite-loop-1'
    return Response.redirect(url)
  }

  if (url.pathname === '/redirects/infinite-loop-1') {
    url.pathname = '/redirects/infinite-loop'
    return Response.redirect(url)
  }

  if (url.pathname === '/redirects/to') {
    url.pathname = url.searchParams.get('pathname')
    url.searchParams.delete('pathname')
    return Response.redirect(url)
  }
}
