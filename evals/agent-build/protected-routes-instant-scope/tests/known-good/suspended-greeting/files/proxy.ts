import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySession } from '@/lib/vendor/session-sdk'
import { SESSION_COOKIE } from '@/lib/session'

// Signed-out and expired sessions never reach the workspace renderer: they
// get a real HTTP redirect to /login from here, before rendering starts.
// Marketing pages and /login are outside the matcher and stay static.
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await verifySession(token) : null

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/app/:path*',
}
