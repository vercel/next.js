import { NextResponse } from 'next/server'

export function middleware(req: Request) {
  return NextResponse.rewrite(new URL('/', req.url))
}
