import { NextResponse, type NextRequest } from 'next/server'

// Optimistic check at the edge: a request without a session cookie never
// reaches the workspace, and it gets a real HTTP redirect before any HTML
// streams. Pages still verify the session before showing data.
export default function proxy(request: NextRequest) {
  if (!request.cookies.has('ledger_session')) {
    const login = new URL('/login', request.url)
    login.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(login)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/app/:path*'] }
