import { cookies } from 'next/headers'
import { NextResponse, unstable_after as after } from 'next/server'
import { cliLog } from './utils/log'

export function middleware(
  /** @type {import ('next/server').NextRequest} */ request
) {
  const url = new URL(request.url)

  const match = url.pathname.match(
    /^(?<prefix>\/[^/]+?)\/middleware\/redirect-source/
  )
  if (match) {
    const prefix = match.groups.prefix
    const requestId = url.searchParams.get('requestId')
    after(async () => {
      cliLog({
        source: '[middleware] /middleware/redirect-source',
        requestId,
        cookies: { testCookie: (await cookies()).get('testCookie')?.value },
      })
    })
    return NextResponse.redirect(
      new URL(prefix + '/middleware/redirect', request.url)
    )
  }
}

export const config = {
  matcher: ['/:prefix/middleware/:path*'],
}
