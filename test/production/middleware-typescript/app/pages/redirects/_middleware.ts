import { NextMiddleware, NextResponse } from 'next/server'

export const middleware: NextMiddleware = async function (request) {
  const url = request.nextUrl

  if (url.searchParams.get('foo') === 'bar') {
    url.pathname = '/redirects/new-home'
    url.searchParams.delete('foo')
    return Response.redirect(url)
  }

  if (url.pathname === '/redirects/old-home') {
    url.pathname = '/redirects/new-home'
    return NextResponse.redirect(url)
  }
}
