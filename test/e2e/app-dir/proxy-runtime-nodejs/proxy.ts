import { NextRequest, NextResponse } from 'next/server'
// Will not work in edge runtime
import { join } from 'path/posix'

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === join('/', 'foo')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}
