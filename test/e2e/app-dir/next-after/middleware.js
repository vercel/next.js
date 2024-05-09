import { cookies } from 'next/headers'
import { NextResponse, unstable_after as after } from 'next/server'
import { cliLog } from './utils/log-cli'

export function middleware(
  /** @type {import ('next/server').NextRequest} */ request
) {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/middleware/redirect-source')) {
    console.trace('middleware!')
    const requestId = url.searchParams.get('requestId')
    after(() => {
      cliLog({
        source: '[middleware] /middleware/redirect-source',
        requestId,
        cookies: { testCookie: cookies().get('testCookie')?.value },
      })
    })
    return NextResponse.redirect(new URL('/middleware/redirect', request.url))
  }
}

export const config = {
  matcher: '/middleware/:path*',
}
