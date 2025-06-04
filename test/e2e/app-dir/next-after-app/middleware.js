import { cookies } from 'next/headers'
import { NextResponse, after } from 'next/server'
import { cliLog } from './utils/log'

export async function middleware(
  /** @type {import ('next/server').NextRequest} */ request
) {
  const url = new URL(request.url)

  {
    const match = url.pathname.match(
      /^(?<prefix>\/[^/]+?)\/middleware\/redirect-source/
    )
    if (match) {
      const prefix = match.groups.prefix
      const requestId = url.searchParams.get('requestId')
      const cookieStore = await cookies()
      after(async () => {
        cliLog({
          source: '[middleware] /middleware/redirect-source',
          requestId,
          cookies: { testCookie: cookieStore.get('testCookie')?.value },
        })
      })
      return NextResponse.redirect(
        new URL(prefix + '/middleware/redirect', request.url)
      )
    }
  }

  {
    const match = url.pathname.match(
      /^(?<prefix>\/[^/]+?)\/provided-request-context\/middleware/
    )
    if (match) {
      const prefix = match.groups.prefix
      after(() => {
        cliLog({
          source: '[middleware] /provided-request-context/middleware',
        })
      })
      return NextResponse.redirect(
        new URL(prefix + '/middleware/redirect', request.url)
      )
    }
  }
}

export const config = {
  matcher: [
    '/:prefix/middleware/:path*',
    '/:prefix/provided-request-context/middleware',
  ],
}
