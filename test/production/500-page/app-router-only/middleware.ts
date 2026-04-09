import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/middleware-error') {
    throw new Error('middleware error')
  }
  return NextResponse.next()
}
