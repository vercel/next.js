import { NextResponse } from 'next/server'

export function middleware(req: Request) {
  return NextResponse.next({
    headers: {
      'middleware-x-forwarded-host':
        req.headers.get('x-forwarded-host') ?? 'wrong',
      'middleware-x-forwarded-port':
        req.headers.get('x-forwarded-port') ?? 'wrong',
      'middleware-x-forwarded-proto':
        req.headers.get('x-forwarded-proto') ?? 'wrong',
    },
  })
}
