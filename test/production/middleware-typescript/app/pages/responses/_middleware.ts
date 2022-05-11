import { NextMiddleware, NextResponse } from 'next/server'

export const middleware: NextMiddleware = async function (request) {
  const url = request.nextUrl
  const next = NextResponse.next()

  // Header based on query param
  if (url.searchParams.get('set-header') === 'true') {
    next.headers.set('x-set-header', 'valid')
  }

  if (url.pathname === '/responses/bad-status') {
    return new Response(null, {
      headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
      status: 401,
    })
  }

  return next
}
