import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const USER = 'admin'
const PASSWORD = 'secret'

export function middleware(request: NextRequest) {
  const authorization = request.headers.get('authorization')

  if (authorization) {
    const [scheme, encoded] = authorization.split(' ')

    if (scheme === 'Basic' && encoded) {
      const [user, password] = atob(encoded).split(':')

      if (user === USER && password === PASSWORD) {
        return NextResponse.next()
      }
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="protected"' },
  })
}

export const config = {
  matcher: ['/((?!_next).*)'],
}
