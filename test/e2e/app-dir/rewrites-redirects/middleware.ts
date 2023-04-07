import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  try {
    throw new Error('middleware')
  } catch (e) {
    console.log('middleware', e)
    throw e
  }
  const [, , to, ...testType] = request.nextUrl.pathname.split('/')
  if (testType[0] === 'middleware-rewrite-before') {
    return NextResponse.rewrite(
      new URL(`/${to}/${to}/middleware-rewrite-after`, request.url)
    )
  }

  if (testType[0] === 'middleware-redirect-before') {
    return NextResponse.redirect(
      new URL(`/${to}/${to}/middleware-redirect-after`, request.url)
    )
  }
}
