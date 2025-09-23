import { NextResponse } from 'next/server'

export function proxy(req: Request) {
  return NextResponse.redirect(new URL('/', req.url))
}

export const config = {
  matcher: ['/foo'],
}
