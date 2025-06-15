import { cookies } from 'next/headers'
import { NextResponse, after } from 'next/server'
import { cliLog } from './utils/log'

export async function middleware(
  /** @type {import ('next/server').NextRequest} */ request
) {
  try {
    // In the edge runtime sandbox, `setImmediate` is defined, but will throw if called
    setImmediate(() => {})
  } catch (err) {
    throw new Error('This test is expected to run in node.js middleware')
  }

  const url = new URL(request.url)
  {
    const match = url.pathname.match(/^\/middleware\/redirect-source/)
    if (match) {
      console.log('matched', url)
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

  {
    const match = url.pathname.match(/\/provided-request-context\/middleware/)
    if (match) {
      after(() => {
        cliLog({
          source: '[middleware] /provided-request-context/middleware',
        })
      })
      return NextResponse.redirect(new URL('/middleware/redirect', request.url))
    }
  }
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/middleware/:path*', '/provided-request-context/middleware'],
}
