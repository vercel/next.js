import { NextResponse } from 'next/server'
import { textValue, TestLink } from './lib/shared-module'

export function middleware(request) {
  if (request.nextUrl.pathname === '/middleware-transform') {
    return Response.json({
      clientReference: TestLink.$$typeof.toString(),
      textValue,
    })
  }

  return NextResponse.next()
}
