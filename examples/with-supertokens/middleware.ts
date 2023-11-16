import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SessionContainer } from 'supertokens-node/recipe/session'
import { withSession } from './app/sessionUtils'

export async function middleware(
  request: NextRequest & { session?: SessionContainer }
) {
  if (request.headers.has('x-user-id')) {
    console.warn(
      'The FE tried to pass x-user-id, which is only supposed to be a backend internal header. Ignoring.'
    )
    request.headers.delete('x-user-id')
  }

  if (request.nextUrl.pathname.startsWith('/api/auth')) {
    // this hits our pages/api/auth/* endpoints
    return NextResponse.next()
  }

  return withSession(request, async (session) => {
    if (session === undefined) {
      return NextResponse.next()
    }
    return NextResponse.next({
      headers: {
        'x-user-id': session.getUserId(),
      },
    })
  })
}

export const config = {
  matcher: '/api/:path*',
}
