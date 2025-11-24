// @ts-check
import { NextResponse } from 'next/server'

/**
 * @param {import('next/server').NextRequest} request
 * @returns {Promise<NextResponse | undefined>}
 */
export async function middleware(request) {
  if (request.nextUrl.pathname === '/searchparams-normalization-bug') {
    const headers = new Headers(request.headers)
    headers.set('test', request.nextUrl.searchParams.get('val') || '')
    const response = NextResponse.next({
      request: {
        headers,
      },
    })

    return response
  }
  if (request.nextUrl.pathname === '/exists-but-not-routed') {
    return NextResponse.rewrite(new URL('/dashboard', request.url))
  }

  if (request.nextUrl.pathname === '/middleware-to-dashboard') {
    return NextResponse.rewrite(new URL('/dashboard', request.url))
  }

  if (request.nextUrl.pathname === '/bootstrap/with-nonce') {
    // In a real app, crypto.randomUUID() would be used to generate a safe nonce.
    // React and Webpack use eval() in development mode, so we need to allow it.
    const csp = `script-src 'nonce-my-random-nonce' 'strict-dynamic'${process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''};`
    return NextResponse.next({
      headers: {
        'Content-Security-Policy': csp,
      },
    })
  }

  if (request.nextUrl.pathname.startsWith('/internal/test')) {
    const method = request.nextUrl.pathname.endsWith('rewrite')
      ? 'rewrite'
      : 'redirect'

    const internal = ['rsc', 'next-router-state-tree']
    if (internal.some((name) => request.headers.has(name))) {
      return NextResponse[method](new URL('/internal/failure', request.url))
    }

    return NextResponse[method](new URL('/internal/success', request.url))
  }

  if (request.nextUrl.pathname === '/search-params-prop-middleware-rewrite') {
    return NextResponse.rewrite(
      new URL(
        '/search-params-prop?first=value&second=other%20value&third',
        request.url
      )
    )
  }

  if (
    request.nextUrl.pathname === '/search-params-prop-server-middleware-rewrite'
  ) {
    return NextResponse.rewrite(
      new URL(
        '/search-params-prop/server?first=value&second=other%20value&third',
        request.url
      )
    )
  }

  if (request.nextUrl.pathname === '/script-nonce') {
    const nonce = crypto.randomUUID()

    return NextResponse.next({
      headers: {
        'content-security-policy': `script-src 'nonce-${nonce}' 'strict-dynamic';`,
      },
    })
  }

  if (request.nextUrl.pathname === '/script-nonce/with-next-font') {
    const nonce = crypto.randomUUID()

    return NextResponse.next({
      headers: {
        'content-security-policy': `script-src 'nonce-${nonce}' 'strict-dynamic';`,
      },
    })
  }
}
