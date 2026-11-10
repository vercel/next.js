import { NextResponse } from 'next/server'

// `middleware.ts` is reported as the `middleware` route type. We only need it
// to exist for the test — its behavior doesn't matter.
export function middleware() {
  return NextResponse.next()
}

export const config = {
  matcher: '/about',
}
