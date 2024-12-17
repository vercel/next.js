import { cookies } from 'next/headers'
import { NextResponse, after } from 'next/server'
import { cliLog } from './utils/log'

export async function middleware(
  /** @type {import ('next/server').NextRequest} */ request
) {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/middleware/redirect-source')) {
    const requestId = url.searchParams.get('requestId')
    const cookieStore = await cookies()
    after(async () => {
      cliLog({
        source: '[middleware] /middleware/redirect-source',
        requestId,
        cookies: { testCookie: cookieStore.get('testCookie')?.value },
      })
    })
    return NextResponse.redirect(new URL('/middleware/redirect', request.url))
  }
}

export const config = {
  matcher: '/middleware/:path*',
}
